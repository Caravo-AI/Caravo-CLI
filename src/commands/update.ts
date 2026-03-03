import { execSync } from "child_process";
import { log } from "../lib/output.js";
import { checkForUpdate } from "../lib/version-check.js";

export async function runUpdate(currentVersion: string): Promise<void> {
  const info = await checkForUpdate("@caravo/cli", currentVersion);
  if (!info) {
    log(`Already on the latest version (${currentVersion})`);
    return;
  }

  log(`Updating @caravo/cli ${info.current} → ${info.latest}...`);
  try {
    execSync("npm install -g @caravo/cli@latest", { stdio: "inherit" });
    log(`✓ Updated to ${info.latest}`);
  } catch {
    log(`Update failed. Try manually: npm install -g @caravo/cli@latest`);
    process.exit(1);
  }
}
