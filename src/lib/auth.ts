import { readFileSync, existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { loadOrCreateWallet } from "../wallet.js";
import type { Wallet } from "../wallet.js";

const DEFAULT_BASE_URL = "https://caravo.ai";
const CONFIG_FILE = join(homedir(), ".caravo", "config.json");

function readConfigApiKey(): string | undefined {
  try {
    if (!existsSync(CONFIG_FILE)) return undefined;
    const c = JSON.parse(readFileSync(CONFIG_FILE, "utf-8"));
    return typeof c.api_key === "string" ? c.api_key : undefined;
  } catch {
    return undefined;
  }
}

export interface AuthContext {
  mode: "apikey" | "x402";
  apiKey?: string;
  baseUrl: string;
  /** Lazily loaded — only accesses wallet on first use. */
  readonly wallet: Wallet;
  headers(): Record<string, string>;
}

export function resolveAuth(args: {
  apiKey?: string;
  baseUrl?: string;
  walletPath?: string;
}): AuthContext {
  // Priority: explicit --api-key flag → CARAVO_API_KEY env → ~/.caravo/config.json
  const apiKey = args.apiKey || process.env.CARAVO_API_KEY || readConfigApiKey();
  const baseUrl =
    args.baseUrl || process.env.CARAVO_URL || DEFAULT_BASE_URL;
  let cached: Wallet | undefined;

  return {
    mode: apiKey ? "apikey" : "x402",
    apiKey,
    baseUrl,
    get wallet(): Wallet {
      if (!cached) cached = loadOrCreateWallet(args.walletPath);
      return cached;
    },
    headers() {
      const h: Record<string, string> = { "Content-Type": "application/json" };
      if (apiKey) h["Authorization"] = `Bearer ${apiKey}`;
      return h;
    },
  };
}
