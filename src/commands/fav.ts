import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { apiGet, apiPost, apiDelete, validateToolId } from "../lib/api.js";
import { outputJson, log } from "../lib/output.js";
import type { AuthContext } from "../lib/auth.js";

// ─── Local favorites ────────────────────────────────────────────────────────

const FAV_DIR = join(homedir(), ".caravo");
const FAV_FILE = join(FAV_DIR, "favorites.json");

interface LocalFavorites {
  version: string;
  favorites: string[];
}

function readLocal(): LocalFavorites {
  if (!existsSync(FAV_FILE)) return { version: "1.0.0", favorites: [] };
  try {
    const raw = JSON.parse(readFileSync(FAV_FILE, "utf-8"));
    if (Array.isArray(raw.favorites)) return raw as LocalFavorites;
  } catch {}
  return { version: "1.0.0", favorites: [] };
}

function writeLocal(favs: LocalFavorites): void {
  mkdirSync(FAV_DIR, { recursive: true });
  writeFileSync(FAV_FILE, JSON.stringify(favs, null, 2) + "\n");
}

function localList(compact: boolean): void {
  const { favorites } = readLocal();
  const data = { data: favorites.map((id) => ({ id })), total: favorites.length };
  outputJson(data, compact);
}

async function localAdd(toolId: string, baseUrl: string): Promise<void> {
  // Verify tool exists on server before adding
  try {
    const r = await fetch(`${baseUrl}/api/tools/${toolId}`);
    if (r.status === 404) {
      log(`Tool not found: ${toolId}`);
      process.exit(1);
    }
  } catch {
    // Network error — allow offline add
  }
  const favs = readLocal();
  if (favs.favorites.includes(toolId)) {
    log(`${toolId} is already in favorites`);
    return;
  }
  favs.favorites.push(toolId);
  writeLocal(favs);
  log(`✓ Added ${toolId} to local favorites`);
}

function localRm(toolId: string): void {
  const favs = readLocal();
  const idx = favs.favorites.indexOf(toolId);
  if (idx === -1) {
    log(`${toolId} is not in favorites`);
    return;
  }
  favs.favorites.splice(idx, 1);
  writeLocal(favs);
  log(`✓ Removed ${toolId} from local favorites`);
}

// ─── Auto-sync: merge local → server on first authenticated run ─────────────

async function autoSyncLocalToServer(auth: AuthContext): Promise<void> {
  if (!existsSync(FAV_FILE)) return;
  const local = readLocal();
  if (local.favorites.length === 0) return;

  log(`Found ${local.favorites.length} local favorite(s), syncing to server...`);

  // Get current server favorites to check connectivity and avoid duplicates
  const serverData = (await apiGet("/api/favorites", auth)) as { data?: { id: string }[]; error?: string };
  if (serverData?.error || !serverData?.data) {
    log("Server sync skipped (auth failed) — keeping local favorites");
    return;
  }
  const serverIds = new Set(serverData.data.map((f) => f.id));

  let added = 0;
  for (const toolId of local.favorites) {
    if (serverIds.has(toolId)) continue;
    try {
      await apiPost("/api/favorites", { tool_id: toolId }, auth);
      added++;
    } catch {
      // Tool may no longer exist — skip silently
    }
  }

  // Only remove local file after successful sync
  try { unlinkSync(FAV_FILE); } catch {}
  log(`✓ Synced ${added} new favorite(s) to server (local file removed)`);
}

// ─── Main entry ─────────────────────────────────────────────────────────────

export async function run(
  sub: string | undefined,
  toolId: string | undefined,
  auth: AuthContext,
  compact: boolean
): Promise<void> {
  // Authenticated → server mode (with auto-sync from local on first run)
  if (auth.mode === "apikey") {
    await autoSyncLocalToServer(auth);
    return runServer(sub, toolId, auth, compact);
  }

  // No API key → local mode
  log("[local mode — set CARAVO_API_KEY to sync with server]");
  return runLocal(sub, toolId, compact, auth.baseUrl);
}

async function runServer(
  sub: string | undefined,
  toolId: string | undefined,
  auth: AuthContext,
  compact: boolean
): Promise<void> {
  switch (sub) {
    case "list": {
      const data = await apiGet("/api/favorites", auth);
      outputJson(data, compact);
      break;
    }
    case "add": {
      if (!toolId) { log("Usage: caravo fav add <tool-id>"); process.exit(1); }
      const err = validateToolId(toolId);
      if (err) { log(err); process.exit(1); }
      const { data } = await apiPost("/api/favorites", { tool_id: toolId }, auth);
      outputJson(data, compact);
      break;
    }
    case "rm": {
      if (!toolId) { log("Usage: caravo fav rm <tool-id>"); process.exit(1); }
      const err = validateToolId(toolId);
      if (err) { log(err); process.exit(1); }
      const data = await apiDelete("/api/favorites", { tool_id: toolId }, auth);
      outputJson(data, compact);
      break;
    }
    default:
      log("Usage: caravo fav <list|add|rm> [tool-id]");
      process.exit(1);
  }
}

async function runLocal(
  sub: string | undefined,
  toolId: string | undefined,
  compact: boolean,
  baseUrl: string
): Promise<void> {
  switch (sub) {
    case "list":
      localList(compact);
      break;
    case "add": {
      if (!toolId) { log("Usage: caravo fav add <tool-id>"); process.exit(1); }
      const err = validateToolId(toolId);
      if (err) { log(err); process.exit(1); }
      await localAdd(toolId, baseUrl);
      break;
    }
    case "rm": {
      if (!toolId) { log("Usage: caravo fav rm <tool-id>"); process.exit(1); }
      const err = validateToolId(toolId);
      if (err) { log(err); process.exit(1); }
      localRm(toolId);
      break;
    }
    default:
      log("Usage: caravo fav <list|add|rm> [tool-id]");
      process.exit(1);
  }
}
