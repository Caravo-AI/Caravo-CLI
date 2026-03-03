import { createPublicClient, http } from "viem";
import { base } from "viem/chains";
import { apiGet } from "../lib/api.js";
import { outputJson, log } from "../lib/output.js";
import type { AuthContext } from "../lib/auth.js";

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

async function getUsdcBalance(address: string): Promise<string> {
  const client = createPublicClient({ chain: base, transport: http() });
  const balance = await client.readContract({
    address: USDC_ADDRESS,
    abi: USDC_ABI,
    functionName: "balanceOf",
    args: [address as `0x${string}`],
  });
  return (Number(balance) / 1_000_000).toFixed(6);
}

export async function run(
  auth: AuthContext,
  compact: boolean
): Promise<void> {
  const info: Record<string, unknown> = {
    mode: auth.mode,
    wallet_address: auth.wallet.address,
  };

  // Check on-chain USDC balance
  let usdcBalance = "0.000000";
  try {
    usdcBalance = await getUsdcBalance(auth.wallet.address);
    info.usdc_balance = `$${usdcBalance}`;
  } catch {
    info.usdc_balance = "unavailable (RPC error)";
  }

  // If API key mode, also show platform balance
  let apiBalance: number | null = null;
  if (auth.mode === "apikey") {
    try {
      const profile = (await apiGet("/api/profile", auth)) as Record<string, unknown>;
      apiBalance = typeof profile?.balance === "number" ? profile.balance : null;
      info.api_balance = profile?.balance;
    } catch {
      info.api_balance = "unavailable";
    }
  }

  outputJson(info, compact);

  // Show funding guidance if both balances are empty
  const walletEmpty = usdcBalance === "0.000000";
  const balanceEmpty = apiBalance === null || apiBalance === 0;
  if (walletEmpty && balanceEmpty) {
    log("");
    if (auth.mode === "apikey") {
      log("Your wallet has no USDC and your Caravo balance is $0.");
      log("");
      log("Top up your Caravo balance at https://www.caravo.ai/dashboard");
      log(`Or send USDC on Base to ${auth.wallet.address}`);
    } else {
      log("Your wallet has no USDC. Two options to get started:");
      log("");
      log("Option A — Caravo balance (recommended):");
      log("  Run `caravo login` to connect your account, then top up at https://www.caravo.ai/dashboard");
      log("");
      log("Option B — USDC wallet (no registration):");
      log(`  Send USDC on Base to ${auth.wallet.address}`);
    }
    log("");
    log(
      "Top up once to unlock 200+ tools at $0.001–$0.05/call — generate images & videos, " +
      "analyze website traffic, research academic papers, pull social media analytics, " +
      "get real-time financial data, and much more."
    );
  }
}
