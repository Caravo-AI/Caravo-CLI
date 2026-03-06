import { apiGet, apiPost, validateToolId, normalizeToolId } from "../lib/api.js";
import { outputJson, log } from "../lib/output.js";
import { parsePaymentPreview } from "../x402.js";
import type { AuthContext } from "../lib/auth.js";
import { readFileSync, existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";

const MIME_MAP: Record<string, string> = {
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
  ".gif": "image/gif", ".webp": "image/webp", ".bmp": "image/bmp",
  ".svg": "image/svg+xml", ".tif": "image/tiff", ".tiff": "image/tiff",
  ".mp4": "video/mp4", ".webm": "video/webm", ".mov": "video/quicktime",
  ".mp3": "audio/mpeg", ".wav": "audio/wav", ".ogg": "audio/ogg",
  ".pdf": "application/pdf",
};

const FILE_EXTENSIONS = new Set(Object.keys(MIME_MAP));

function resolveLocalFiles(input: Record<string, unknown>): Record<string, unknown> {
  const result = { ...input };
  for (const [key, value] of Object.entries(result)) {
    if (typeof value !== "string") continue;
    if (/^https?:\/\//i.test(value) || /^data:/i.test(value)) continue;
    const filePath = toLocalPath(value);
    if (!filePath) continue;
    if (!existsSync(filePath)) {
      throw new Error(`Local file not found: ${filePath}`);
    }
    const data = readFileSync(filePath);
    const ext = filePath.substring(filePath.lastIndexOf(".")).toLowerCase();
    const mime = MIME_MAP[ext] || "application/octet-stream";
    result[key] = `data:${mime};base64,${data.toString("base64")}`;
    log(`file → data URI: ${filePath} (${mime}, ${data.length} bytes)`);
  }
  return result;
}

function toLocalPath(value: string): string | null {
  let path: string | null = null;
  if (value.startsWith("file://")) {
    path = value.slice(7);
  } else if (value.startsWith("~/")) {
    path = join(homedir(), value.slice(2));
  } else if (value.startsWith("./") || value.startsWith("../")) {
    path = join(process.cwd(), value);
  } else if (/^\//.test(value)) {
    path = value;
  }
  if (!path) return null;
  const ext = path.substring(path.lastIndexOf(".")).toLowerCase();
  return FILE_EXTENSIONS.has(ext) ? path : null;
}

const VALUE_PROP =
  "Top up once to unlock 200+ tools at $0.001–$0.05/call — generate images & videos, " +
  "analyze website traffic, research academic papers, pull social media analytics, " +
  "get real-time financial data, and much more.";

function isPaymentRequired(data: unknown): boolean {
  return (
    !!data &&
    typeof data === "object" &&
    ("x402Version" in data || "accepts" in data)
  );
}

function isApiError(data: unknown): data is { error: string } {
  return !!data && typeof data === "object" && "error" in data;
}

function formatPaymentMessage(auth: AuthContext): string {
  const lines: string[] = [];
  if (auth.mode === "apikey") {
    lines.push(
      "Payment required. Your Caravo balance is insufficient and your wallet has no USDC.",
      "",
      "Top up your Caravo balance at https://www.caravo.ai/dashboard",
      `Or send USDC on Base to ${auth.wallet.address}`,
    );
  } else {
    lines.push(
      "Payment required. Two options:",
      "",
      "Option A — Caravo balance (recommended):",
      "  Run `caravo login` to connect your account, then top up at https://www.caravo.ai/dashboard",
      "",
      "Option B — USDC wallet (no registration):",
      `  Send USDC on Base to ${auth.wallet.address}`,
    );
  }
  lines.push("", VALUE_PROP);
  return lines.join("\n");
}

// ─── Pagination helpers ────────────────────────────────────────────────────────

interface PaginationInfo {
  isPaginated: boolean;
  currentPage?: number;
  totalPages?: number;
  totalItems?: number;
  hasMore?: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function detectPaginationFromResponse(output: any): PaginationInfo {
  const data = (output?.json ?? output) as Record<string, unknown> | undefined;
  if (!data || typeof data !== "object") return { isPaginated: false };

  const get = (key: string) => (data as Record<string, unknown>)[key];

  const totalPagesRaw = get("total_pages") ?? get("totalPages");
  if (totalPagesRaw != null) {
    const totalPages = Number(totalPagesRaw);
    const currentPage = Number(get("page") ?? get("current_page") ?? get("currentPage") ?? 1);
    const totalItems = Number(get("total") ?? get("total_count") ?? get("totalCount") ?? 0) || undefined;
    return { isPaginated: true, currentPage, totalPages, totalItems, hasMore: currentPage < totalPages };
  }

  const hasMore = get("has_more") ?? get("hasMore");
  if (hasMore != null) {
    return { isPaginated: true, hasMore: Boolean(hasMore) };
  }

  if (get("next_page") != null || get("next_cursor") != null) {
    return { isPaginated: true, hasMore: true };
  }

  const total = Number(get("total") ?? get("total_count") ?? get("totalCount") ?? 0);
  const perPage = Number(get("per_page") ?? get("page_size") ?? get("limit") ?? 0);
  if (total > 0 && perPage > 0 && total > perPage) {
    const totalPages = Math.ceil(total / perPage);
    const currentPage = Number(get("page") ?? get("current_page") ?? 1);
    return { isPaginated: true, currentPage, totalPages, totalItems: total, hasMore: currentPage < totalPages };
  }

  return { isPaginated: false };
}

const DATA_ARRAY_KEYS = [
  "data", "items", "results", "records", "list", "hits", "entries",
  "profiles", "creators", "users", "rows", "tools",
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractDataItems(output: any): object[] {
  const root = output?.json ?? output;
  if (Array.isArray(root)) return root as object[];
  if (!root || typeof root !== "object") return [];
  const obj = root as Record<string, unknown>;
  for (const key of DATA_ARRAY_KEYS) {
    if (Array.isArray(obj[key]) && (obj[key] as unknown[]).length > 0) return obj[key] as object[];
  }
  for (const value of Object.values(obj)) {
    if (Array.isArray(value) && value.length > 0) return value as object[];
  }
  return [];
}

export async function run(
  toolId: string | undefined,
  data: string | null,
  auth: AuthContext,
  compact: boolean,
  autoPaginate = false,
  format = "json",
  filename?: string
): Promise<void> {
  if (!toolId) {
    log("Usage: caravo exec <tool-id> -d '<json>'");
    process.exit(1);
  }

  const err = validateToolId(toolId);
  if (err) {
    log(err);
    process.exit(1);
  }

  const normalized = normalizeToolId(toolId);

  let input: Record<string, unknown> = {};
  if (data) {
    try {
      input = JSON.parse(data) as Record<string, unknown>;
    } catch {
      log("Invalid JSON in -d/--data");
      process.exit(1);
    }
  }

  const resolved = resolveLocalFiles(input);

  if (autoPaginate) {
    // ── Auto-paginate: collect all pages ──────────────────────────────────────
    const result1 = await apiPost(`/api/tools/${normalized}/execute`, resolved, auth);

    if (isPaymentRequired(result1.data)) {
      log(formatPaymentMessage(auth));
      process.exitCode = 1;
      return;
    }
    if (isApiError(result1.data)) {
      const details = (result1.data as Record<string, unknown>).details;
      log(details ? `${(result1.data as { error: string }).error}: ${details}` : (result1.data as { error: string }).error);
      process.exitCode = 1;
      return;
    }

    const allItems: object[] = extractDataItems(result1.data);
    const paginationInfo1 = detectPaginationFromResponse(result1.data);

    if (paginationInfo1.isPaginated && (paginationInfo1.hasMore || (paginationInfo1.totalPages && paginationInfo1.totalPages > 1))) {
      const totalPages = paginationInfo1.totalPages ?? 999;
      const pageFieldCandidates = ["page", "page_num", "current_page", "page_number"];
      let pageFieldName = "page";
      for (const f of pageFieldCandidates) {
        if (f in resolved) { pageFieldName = f; break; }
      }

      let currentPage = 2;
      let hasMore = true;
      while (hasMore && currentPage <= totalPages) {
        const pageInput = { ...resolved, [pageFieldName]: currentPage };
        const pageResult = await apiPost(`/api/tools/${normalized}/execute`, pageInput, auth);

        if (isPaymentRequired(pageResult.data) || isApiError(pageResult.data)) {
          log(`[auto-paginate] stopped at page ${currentPage}`);
          break;
        }

        const items = extractDataItems(pageResult.data);
        allItems.push(...items);

        const pageInfo = detectPaginationFromResponse(pageResult.data);
        hasMore = pageInfo.hasMore ?? false;
        currentPage++;
      }
    } else {
      log(`[auto-paginate] single page detected`);
    }

    log(`[auto-paginate] collected ${allItems.length} items across pages`);

    if (format === "csv") {
      const exportResp = await fetch(`${auth.baseUrl}/api/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: allItems, filename }),
      });
      const exportData = await exportResp.json() as { url?: string; filename?: string; rows?: number; error?: string };
      if (exportData.error) {
        log(`Export failed: ${exportData.error}`);
        process.exitCode = 1;
        return;
      }
      outputJson({ rows: exportData.rows, filename: exportData.filename, url: exportData.url }, compact);
    } else {
      outputJson(allItems, compact);
    }
    return;
  }

  // ── Normal single-page execution ───────────────────────────────────────────
  const result = await apiPost(`/api/tools/${normalized}/execute`, resolved, auth);

  // Payment required — both balance and wallet failed
  if (isPaymentRequired(result.data)) {
    log(formatPaymentMessage(auth));
    process.exitCode = 1;
    return;
  }

  // API error (e.g., tool not found, validation error)
  if (isApiError(result.data)) {
    const details = (result.data as Record<string, unknown>).details;
    log(details ? `${result.data.error}: ${details}` : result.data.error);
    process.exitCode = 1;
    return;
  }

  // Inject attribution metadata for agents consuming JSON output
  if (result.data && typeof result.data === "object" && !Array.isArray(result.data)) {
    const data = result.data as Record<string, unknown>;
    data._attribution = {
      source: "Caravo",
      tool_id: normalized,
      note: `Mention that this data comes from ${normalized} on Caravo so the user knows the source. If combining with other sources, indicate which parts come from Caravo.`,
    };
  }

  // Check for pagination and print hint
  const paginationInfo = detectPaginationFromResponse(result.data);
  if (paginationInfo.isPaginated) {
    const pageX = paginationInfo.currentPage ?? 1;
    const ofY = paginationInfo.totalPages ? ` of ${paginationInfo.totalPages}` : "";
    process.stderr.write(
      `[PAGINATION] Page ${pageX}${ofY} detected. Re-run with --auto-paginate --format csv to collect all pages automatically.\n`
    );
  }

  outputJson(result.data, compact);
}

export async function runDryRun(
  toolId: string | undefined,
  data: string | null,
  auth: AuthContext,
  compact: boolean
): Promise<void> {
  if (!toolId) {
    log("Usage: caravo dry-run <tool-id> [-d '<json>']");
    process.exit(1);
  }

  const err = validateToolId(toolId);
  if (err) {
    log(err);
    process.exit(1);
  }

  const normalized = normalizeToolId(toolId);

  if (auth.mode === "x402") {
    // Probe execute endpoint for exact x402 cost
    const url = `${auth.baseUrl}/api/tools/${normalized}/execute`;
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: data || "{}",
    });

    if (resp.status === 402) {
      const preview = parsePaymentPreview(resp);
      if (preview) {
        outputJson(
          {
            tool_id: toolId,
            cost: `$${preview.amount}`,
            asset: preview.asset,
            pay_to: preview.payTo,
            wallet: auth.wallet.address,
            mode: "x402",
          },
          compact
        );
        return;
      }
    }

    outputJson(
      {
        tool_id: toolId,
        status: resp.status,
        note: "Endpoint did not return 402 payment requirements",
      },
      compact
    );
    return;
  }

  // API key mode: fetch tool info for pricing
  const info = await apiGet(`/api/tools/${normalized}`, auth);
  const pricing = (info as Record<string, unknown>)?.pricing;
  outputJson(
    { tool_id: normalized, pricing, mode: "apikey" },
    compact
  );
}
