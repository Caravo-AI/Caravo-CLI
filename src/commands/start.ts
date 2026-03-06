import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { createPublicClient, http } from "viem";
import { base } from "viem/chains";
import { apiGet } from "../lib/api.js";
import { outputJson } from "../lib/output.js";
import type { AuthContext } from "../lib/auth.js";

const CONFIG_DIR = join(homedir(), ".caravo");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

const USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const USDC_ABI = [
  {
    inputs: [{ name: "account", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

async function getUsdcBalance(address: string): Promise<number> {
  const client = createPublicClient({ chain: base, transport: http() });
  const balance = await client.readContract({
    address: USDC_ADDRESS,
    abi: USDC_ABI,
    functionName: "balanceOf",
    args: [address as `0x${string}`],
  });
  return Number(balance) / 1_000_000;
}

function readConfig(): Record<string, unknown> {
  try {
    if (!existsSync(CONFIG_FILE)) return {};
    return JSON.parse(readFileSync(CONFIG_FILE, "utf-8"));
  } catch {
    return {};
  }
}

function writeConfig(config: Record<string, unknown>): void {
  if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2) + "\n");
}

const GREETING = `Caravo skill installed! I can now discover and use 200+ services for you:

- Image, video, audio & 3D generation
- Academic paper search & web scraping
- Website traffic analysis, SEO & keyword research
- Real-time stock quotes, crypto prices & exchange rates
- Domain availability, WHOIS & DNS lookup
- Weather, geolocation & market data
- Social media search & influencer discovery
- Email, SMS, file conversion & validation

Some tools are free. Paid tools cost $0.001–0.05 per call.

Try asking me things like "generate a logo", "what's Apple's stock price right now?", or "analyze traffic on competitor.com".`;

export async function run(
  auth: AuthContext,
  compact: boolean
): Promise<void> {
  const config = readConfig();
  const firstRun = !config.introduced;

  // Check balances
  const loggedIn = auth.mode === "apikey";
  let walletBalance = 0;
  let accountBalance: number | null = null;

  try {
    walletBalance = await getUsdcBalance(auth.wallet.address);
  } catch {
    // RPC error — treat as 0
  }

  if (loggedIn) {
    try {
      const profile = (await apiGet("/api/profile", auth)) as Record<string, unknown>;
      accountBalance = typeof profile?.balance === "number" ? profile.balance : null;
    } catch {
      // unavailable
    }
  }

  const hasMoney =
    walletBalance > 0 || (accountBalance !== null && accountBalance > 0);

  // Determine setup_hint
  let setupNeeded = false;
  let setupHint: string | null = null;

  if (loggedIn && !hasMoney) {
    setupNeeded = true;
    setupHint =
      `Your Caravo account balance is $0 and your local wallet is empty. ` +
      `To use paid tools, top up your balance at https://www.caravo.ai/dashboard ` +
      `or send USDC (Base) to your local wallet: ${auth.wallet.address}\n` +
      `Some tools are free — try them anytime.`;
  } else if (!loggedIn && walletBalance === 0) {
    setupNeeded = true;
    setupHint =
      `To use paid tools, you have two options:\n` +
      `1. Run \`caravo login\` to connect your Caravo account, then top up at https://www.caravo.ai/dashboard\n` +
      `2. Send USDC (Base) to your local wallet: ${auth.wallet.address}\n` +
      `Some tools are free — try them anytime without any setup.`;
  }

  const result: Record<string, unknown> = {
    first_run: firstRun,
    greeting: firstRun ? GREETING : null,
    logged_in: loggedIn,
    wallet_address: auth.wallet.address,
    wallet_balance: `$${walletBalance.toFixed(2)}`,
    ...(loggedIn && accountBalance !== null
      ? { account_balance: `$${accountBalance.toFixed(2)}` }
      : {}),
    setup_needed: setupNeeded,
    setup_hint: setupHint,
  };

  outputJson(result, compact);

  // Mark as introduced
  if (firstRun) {
    config.introduced = true;
    writeConfig(config);
  }
}
