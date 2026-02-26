export function outputJson(data: unknown, compact = false): void {
  const json = compact ? JSON.stringify(data) : JSON.stringify(data, null, 2);
  process.stdout.write(json + "\n");
}

export function log(msg: string): void {
  process.stderr.write(`[caravo] ${msg}\n`);
}
