import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { exec } from "child_process";

const CONFIG_DIR = join(homedir(), ".caravo");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

function loadConfig(): { api_key?: string } {
  try {
    if (!existsSync(CONFIG_FILE)) return {};
    return JSON.parse(readFileSync(CONFIG_FILE, "utf-8"));
  } catch {
    return {};
  }
}

function saveConfig(data: { api_key?: string }): void {
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG_FILE, JSON.stringify(data, null, 2), { mode: 0o600 });
}

function openBrowser(url: string): void {
  const opener =
    process.platform === "darwin"
      ? `open "${url}"`
      : process.platform === "win32"
      ? `start "" "${url}"`
      : `xdg-open "${url}"`;
  exec(opener);
}

export async function runLogin(baseUrl: string): Promise<void> {
  // 1. Create session
  process.stdout.write("Opening browser for login...\n");
  const initRes = await fetch(`${baseUrl}/api/auth/mcp-session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });

  if (!initRes.ok) {
    process.stderr.write(`[caravo] login: server error ${initRes.status}\n`);
    process.exit(1);
  }

  const { token, url } = (await initRes.json()) as { token: string; url: string };

  // 2. Open browser
  openBrowser(url);
  process.stdout.write(`\nOpened: ${url}\n\nWaiting for login (5 min timeout)...\n`);

  // 3. Poll every 2s
  const deadline = Date.now() + 5 * 60 * 1000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 2000));

    const pollRes = await fetch(
      `${baseUrl}/api/auth/mcp-session?token=${encodeURIComponent(token)}`
    );
    const poll = (await pollRes.json()) as { status: string; api_key?: string };

    if (poll.status === "completed" && poll.api_key) {
      // 4. Save to config
      const existing = loadConfig();
      saveConfig({ ...existing, api_key: poll.api_key });

      process.stdout.write(`\n✓ Logged in! API key saved to ${CONFIG_FILE}\n\n`);
      process.stdout.write(
        `To use it immediately (this shell session):\n  export CARAVO_API_KEY=${poll.api_key}\n\n`
      );
      process.stdout.write(
        `To make it permanent, add to your shell profile (~/.zshrc / ~/.bashrc):\n  export CARAVO_API_KEY=${poll.api_key}\n`
      );
      return;
    }

    if (poll.status === "expired") {
      process.stderr.write("[caravo] login: session expired. Run `caravo login` again.\n");
      process.exit(1);
    }

    process.stdout.write(".");
  }

  process.stderr.write("\n[caravo] login: timed out after 5 minutes.\n");
  process.exit(1);
}
