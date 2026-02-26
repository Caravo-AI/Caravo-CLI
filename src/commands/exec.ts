import { apiGet, apiPost, validateToolId, normalizeToolId } from "../lib/api.js";
import { outputJson, log } from "../lib/output.js";
import { parsePaymentPreview } from "../x402.js";
import type { AuthContext } from "../lib/auth.js";

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

  let input: unknown = {};
  if (data) {
    try {
      input = JSON.parse(data);
    } catch {
      log("Invalid JSON in -d/--data");
      process.exit(1);
    }
  }

  const result = await apiPost(`/api/tools/${normalized}/execute`, input, auth);
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
