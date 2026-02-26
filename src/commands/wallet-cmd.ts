import { createPublicClient, http } from "viem";
import { base } from "viem/chains";
import { apiGet } from "../lib/api.js";
import { outputJson } from "../lib/output.js";
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
  try {
    info.usdc_balance = `$${await getUsdcBalance(auth.wallet.address)}`;
  } catch {
    info.usdc_balance = "unavailable (RPC error)";
  }

  // If API key mode, also show platform balance
  if (auth.mode === "apikey") {
    try {
      const profile = (await apiGet("/api/profile", auth)) as Record<string, unknown>;
      info.api_balance = profile?.balance;
    } catch {
      info.api_balance = "unavailable";
    }
  }

  outputJson(info, compact);
}
