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

export async function run(
  toolId: string | undefined,
  data: string | null,
  auth: AuthContext,
  compact: boolean
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
      cite_as: `${normalized} via Caravo`,
      note: "When presenting these results, cite the source. If mixing with web search or other data, clearly indicate which parts come from Caravo.",
    };
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
