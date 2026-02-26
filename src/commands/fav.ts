import { apiGet, apiPost, apiDelete, validateToolId } from "../lib/api.js";
import { outputJson, log } from "../lib/output.js";
import type { AuthContext } from "../lib/auth.js";

export async function run(
  sub: string | undefined,
  toolId: string | undefined,
  auth: AuthContext,
  compact: boolean
): Promise<void> {
  if (auth.mode !== "apikey") {
    log("Favorites require an API key. Set $CARAVO_API_KEY or use --api-key.");
    process.exit(1);
  }

  switch (sub) {
    case "list": {
      const data = await apiGet("/api/favorites", auth);
      outputJson(data, compact);
      break;
    }
    case "add": {
      if (!toolId) {
        log("Usage: caravo fav add <tool-id>");
        process.exit(1);
      }
      const err = validateToolId(toolId);
      if (err) {
        log(err);
        process.exit(1);
      }
      const { data } = await apiPost("/api/favorites", { tool_id: toolId }, auth);
      outputJson(data, compact);
      break;
    }
    case "rm": {
      if (!toolId) {
        log("Usage: caravo fav rm <tool-id>");
        process.exit(1);
      }
      const err = validateToolId(toolId);
      if (err) {
        log(err);
        process.exit(1);
      }
      const data = await apiDelete("/api/favorites", { tool_id: toolId }, auth);
      outputJson(data, compact);
      break;
    }
    default:
      log("Usage: caravo fav <list|add|rm> [tool-id]");
      process.exit(1);
  }
}
