import { outputJson, log } from "../lib/output.js";
import type { AuthContext } from "../lib/auth.js";

/**
 * caravo export -d '<json-array>' --format csv --filename mydata
 *
 * Exports data to a CSV download URL or prints JSON inline.
 * No charge — free operation.
 */
export async function run(
  data: string | null,
  auth: AuthContext,
  compact: boolean,
  format = "json",
  filename?: string
): Promise<void> {
  if (!data) {
    log("Usage: caravo export -d '<json-array>' [--format csv|json] [--filename <name>]");
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
    log("Error: data must be a non-empty JSON array");
    process.exitCode = 1;
    return;
  }

  if (format === "json") {
    outputJson(parsed, compact);
    return;
  }

  // CSV: POST to export API
  const resp = await fetch(`${auth.baseUrl}/api/export`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data: parsed, filename }),
  });

  const result = await resp.json() as { url?: string; filename?: string; rows?: number; error?: string };

  if (result.error) {
    log(`Export failed: ${result.error}`);
    process.exitCode = 1;
    return;
  }

  outputJson({ rows: result.rows, filename: result.filename, url: result.url }, compact);
}
