import { apiGet, validateToolId, normalizeToolId } from "../lib/api.js";
import { outputJson, log } from "../lib/output.js";
import type { AuthContext } from "../lib/auth.js";

export async function run(
  toolId: string | undefined,
  auth: AuthContext,
  compact: boolean
): Promise<void> {
  if (!toolId) {
    log("Usage: caravo info <tool-id>");
    process.exit(1);
  }

  const err = validateToolId(toolId);
  if (err) {
    log(err);
    process.exit(1);
  }

  const normalized = normalizeToolId(toolId);
  const data = await apiGet(`/api/tools/${normalized}`, auth);
  outputJson(data, compact);
}
