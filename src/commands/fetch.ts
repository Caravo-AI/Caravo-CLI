import { writeFileSync } from "fs";
import { fetchWithX402, parsePaymentPreview } from "../x402.js";
import { outputJson, log } from "../lib/output.js";
import type { AuthContext } from "../lib/auth.js";

export async function run(
  positional: string[],
  opts: {
    data: string | null;
    headers: Record<string, string>;
    output: string | null;
    dryRun: boolean;
    compact: boolean;
  },
  auth: AuthContext
): Promise<void> {
  let method: string;
  let url: string;

  if (positional.length >= 2) {
    method = positional[0].toUpperCase();
    url = positional[1];
  } else if (positional.length === 1) {
    method = "GET";
    url = positional[0];
  } else {
    log("Usage: caravo fetch [METHOD] <url> [-d '<json>']");
    process.exit(1);
  }

  const headers: Record<string, string> = { ...opts.headers };
  if (opts.data && !headers["Content-Type"] && !headers["content-type"]) {
    headers["Content-Type"] = "application/json";
  }

  const fetchOpts: RequestInit = {
    method,
    headers,
    ...(opts.data ? { body: opts.data } : {}),
  };

  // --dry-run: probe endpoint for cost without paying
  if (opts.dryRun) {
    const resp = await fetch(url, fetchOpts);
    if (resp.status === 402) {
      const preview = parsePaymentPreview(resp);
      if (preview) {
        outputJson(
          {
            dry_run: true,
            cost: `$${preview.amount}`,
            pay_to: preview.payTo,
            wallet: auth.wallet.address,
          },
          opts.compact
        );
      } else {
        const body = await resp.text();
        outputJson({ dry_run: true, status: 402, body }, opts.compact);
      }
    } else {
      outputJson(
        {
          dry_run: true,
          status: resp.status,
          note: "Endpoint did not return 402",
        },
        opts.compact
      );
    }
    return;
  }

  // Make request with automatic x402 payment
  const { response, paid, cost } = await fetchWithX402(url, fetchOpts, auth.wallet);
  const body = await response.text();

  if (paid) log(`paid $${cost} via x402`);

  if (opts.output) {
    writeFileSync(opts.output, body);
    log(`response written to ${opts.output}`);
  } else {
    process.stdout.write(body);
    if (!body.endsWith("\n")) process.stdout.write("\n");
  }

  if (!response.ok) process.exit(1);
}
