import { execSync } from "child_process";
import { log } from "../lib/output.js";
import { checkForUpdate, clearNpxCache, isNpxRun } from "../lib/version-check.js";

export async function runUpdate(currentVersion: string): Promise<void> {
  const info = await checkForUpdate("@caravo/cli", currentVersion);
  if (!info) {
    log(`Already on the latest version (${currentVersion})`);
    return;
  }

  log(`Updating @caravo/cli ${info.current} → ${info.latest}...`);

  if (isNpxRun()) {
    // npx: clear cache so next invocation downloads the latest
    clearNpxCache("@caravo/cli");
    log(`✓ npx cache cleared. Next \`npx @caravo/cli\` run will use ${info.latest}.`);
  } else {
    // Global install: update in place
    try {
      execSync("npm install -g @caravo/cli@latest", { stdio: "inherit" });
      log(`✓ Updated to ${info.latest}`);
    } catch {
      // Global install failed — fall back to clearing npx cache
      clearNpxCache("@caravo/cli");
      log(`Global install failed. npx cache cleared — next \`npx @caravo/cli\` run will use ${info.latest}.`);
      log(`To update globally, run: sudo npm install -g @caravo/cli@latest`);
      process.exit(1);
    }
  }
}
