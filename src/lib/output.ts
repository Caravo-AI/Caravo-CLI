const MAX_JSON_OUTPUT_CHARS = 20_000;

export function safeJsonText(data: unknown, compact = false): string {
  const json = compact ? JSON.stringify(data) : JSON.stringify(data, null, 2);
  if (json.length > MAX_JSON_OUTPUT_CHARS) {
    return json.slice(0, MAX_JSON_OUTPUT_CHARS) + `\n... (truncated, ${json.length} chars total)`;
  }
  return json;
}

export function outputJson(data: unknown, compact = false): void {
  process.stdout.write(safeJsonText(data, compact) + "\n");
}

export function log(msg: string): void {
  process.stderr.write(`[caravo] ${msg}\n`);
}
