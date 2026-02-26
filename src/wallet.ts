import { randomBytes } from "crypto";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { privateKeyToAccount } from "viem/accounts";

const WALLET_DIR = join(homedir(), ".caravo");
const WALLET_FILE = join(WALLET_DIR, "wallet.json");

/**
 * Known wallet paths from other MCP servers and web3 services.
 * On startup we check these in order — if any exist, we reuse that wallet
 * instead of creating a new one. This avoids fragmenting USDC across
 * multiple addresses.
 */
const KNOWN_WALLET_PATHS = [
  // Legacy wallet path (pre-rename)
  join(homedir(), ".fal-marketplace-mcp", "wallet.json"),
  join(homedir(), ".x402scan-mcp", "wallet.json"),
  join(homedir(), ".payments-mcp", "wallet.json"),
];

export interface Wallet {
  privateKey: `0x${string}`;
  address: string;
}

function tryLoadWallet(path: string): Wallet | null {
  try {
    if (!existsSync(path)) return null;
    const data = JSON.parse(readFileSync(path, "utf-8"));
    if (
      typeof data.privateKey === "string" &&
      data.privateKey.startsWith("0x") &&
      typeof data.address === "string" &&
      data.address.startsWith("0x")
    ) {
      return { privateKey: data.privateKey as `0x${string}`, address: data.address };
    }
    return null;
  } catch {
    return null;
  }
}

/** Check if a file exists but is not a valid wallet (corrupted/malformed). */
function isCorruptedWallet(path: string): boolean {
  if (!existsSync(path)) return false;
  return tryLoadWallet(path) === null;
}

export function loadOrCreateWallet(customPath?: string): Wallet {
  // 0. Custom wallet path takes priority
  if (customPath) {
    const custom = tryLoadWallet(customPath);
    if (custom) return custom;
    // Distinguish between missing and corrupted
    if (isCorruptedWallet(customPath)) {
      process.stderr.write(`[caravo] invalid wallet file at ${customPath} (corrupted or malformed)\n`);
    } else {
      process.stderr.write(`[caravo] wallet not found at ${customPath}\n`);
    }
    process.exit(1);
  }

  // 1. Check our own wallet first
  const own = tryLoadWallet(WALLET_FILE);
  if (own) return own;

  // 2. Check wallets from other known MCPs
  for (const path of KNOWN_WALLET_PATHS) {
    const existing = tryLoadWallet(path);
    if (existing) {
      mkdirSync(WALLET_DIR, { recursive: true });
      writeFileSync(WALLET_FILE, JSON.stringify(existing, null, 2), { mode: 0o600 });
      process.stderr.write(`[caravo] reusing existing wallet from ${path}\n`);
      return existing;
    }
  }

  // 3. No existing wallet found — generate new
  const privateKey = ("0x" + randomBytes(32).toString("hex")) as `0x${string}`;
  const account = privateKeyToAccount(privateKey);
  const wallet: Wallet = { privateKey, address: account.address };

  mkdirSync(WALLET_DIR, { recursive: true });
  writeFileSync(WALLET_FILE, JSON.stringify(wallet, null, 2), { mode: 0o600 });
  process.stderr.write(`[caravo] created new wallet: ${account.address}\n`);
  return wallet;
}
