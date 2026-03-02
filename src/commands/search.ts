import { apiGet, parsePositiveInt } from "../lib/api.js";
import { outputJson, log } from "../lib/output.js";
import type { AuthContext } from "../lib/auth.js";

export async function runSearch(
  query: string | undefined,
  opts: { tag?: string; provider?: string; pricingType?: string; page?: string; perPage?: string },
  auth: AuthContext,
  compact: boolean
): Promise<void> {
  const params = new URLSearchParams();
  if (query) params.set("query", query);
  if (opts.tag) params.set("tag", opts.tag);
  if (opts.provider) params.set("provider", opts.provider);
  if (opts.pricingType) params.set("pricing_type", opts.pricingType);

  if (opts.page) {
    const p = parsePositiveInt(opts.page, "page");
    if (p === null) process.exit(1);
    params.set("page", String(p));
  }
  if (opts.perPage) {
    const pp = parsePositiveInt(opts.perPage, "per-page");
    if (pp === null) process.exit(1);
    params.set("per_page", String(pp));
  }

  const qs = params.toString();
  const data = await apiGet(`/api/tools${qs ? `?${qs}` : ""}`, auth);
  outputJson(data, compact);
}

export async function runTags(
  auth: AuthContext,
  compact: boolean
): Promise<void> {
  const data = await apiGet("/api/tags", auth);
  outputJson(data, compact);
}

export async function runProviders(
  auth: AuthContext,
  compact: boolean
): Promise<void> {
  const data = await apiGet("/api/providers", auth);
  outputJson(data, compact);
}
