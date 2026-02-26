import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";

const CONFIG_DIR = join(homedir(), ".caravo");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

function loadConfig(): Record<string, unknown> {
  try {
    if (!existsSync(CONFIG_FILE)) return {};
    return JSON.parse(readFileSync(CONFIG_FILE, "utf-8"));
  } catch {
    return {};
  }
}

function saveConfig(data: Record<string, unknown>): void {
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG_FILE, JSON.stringify(data, null, 2), { mode: 0o600 });
}

export function runLogout(): void {
  const config = loadConfig();

  if (!config.api_key) {
    process.stdout.write("Not logged in — already using x402 wallet payments.\n");
    return;
  }

  delete config.api_key;
  saveConfig(config);

  process.stdout.write(`✓ Logged out. API key removed from ${CONFIG_FILE}\n`);
  process.stdout.write(`Now using x402 wallet payments.\n`);
}
