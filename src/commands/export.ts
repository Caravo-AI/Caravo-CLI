import { apiPost } from "../lib/api.js";
import { outputJson, log } from "../lib/output.js";
import type { AuthContext } from "../lib/auth.js";

export async function run(
  data: string | null,
  auth: AuthContext,
  compact: boolean,
  format: string = "csv",
  filename: string | undefined,
  exportId: string | undefined
): Promise<void> {
  if (!data) {
    log("Usage: caravo export -d '<json-array>' [--format csv|json] [--filename name] [--export-id id]");
    process.exit(1);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch {
    log("Invalid JSON in -d/--data");
    process.exit(1);
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    log("data must be a non-empty JSON array");
    process.exit(1);
  }

  if (format === "json") {
    outputJson(parsed, compact);
    return;
  }

  // csv: POST to /api/export
  const body: Record<string, unknown> = { data: parsed };
  if (filename) body.filename = filename;
  if (exportId) body.export_id = exportId;

  const result = await apiPost("/api/export", body, auth);
  const resData = result.data as Record<string, unknown> | null;

  if (resData && typeof resData === "object" && "error" in resData) {
    log(`Error: ${resData.error}`);
    process.exitCode = 1;
    return;
  }

  outputJson(resData, compact);
}
