import { randomBytes } from "crypto";
import { getAddress } from "viem";
import { signTypedData } from "viem/actions";
import { createWalletClient, http } from "viem";
import { base } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import type { Wallet } from "./wallet.js";

const authorizationTypes = {
  TransferWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
} as const;

interface PaymentRequirements {
  scheme: string;
  network: string;
  amount: string;
  asset: string;
  payTo: string;
  maxTimeoutSeconds: number;
  extra?: { name?: string; version?: string };
}

interface PaymentRequired {
  x402Version: number;
  accepts: PaymentRequirements[];
}

async function signPayment(
  requirements: PaymentRequirements,
  wallet: Wallet
): Promise<object> {
  const account = privateKeyToAccount(wallet.privateKey);
  const client = createWalletClient({ account, chain: base, transport: http() });

  const now = Math.floor(Date.now() / 1000);
  const chainId = parseInt(requirements.network.split(":")[1]);
  const nonce = ("0x" + randomBytes(32).toString("hex")) as `0x${string}`;

  const authorization = {
    from: getAddress(account.address),
    to: getAddress(requirements.payTo),
    value: BigInt(requirements.amount),
    validAfter: BigInt(now - 60),
    validBefore: BigInt(now + requirements.maxTimeoutSeconds),
    nonce,
  };

  const signature = await signTypedData(client, {
    domain: {
      name: requirements.extra?.name ?? "USD Coin",
      version: requirements.extra?.version ?? "2",
      chainId,
      verifyingContract: getAddress(requirements.asset),
    },
    types: authorizationTypes,
    primaryType: "TransferWithAuthorization",
    message: authorization,
  });

  return {
    x402Version: 2,
    resource: undefined,
    accepted: requirements,
    payload: {
      authorization: {
        from: authorization.from,
        to: authorization.to,
        value: authorization.value.toString(),
        validAfter: authorization.validAfter.toString(),
        validBefore: authorization.validBefore.toString(),
        nonce,
      },
      signature,
    },
  };
}

export async function fetchWithX402(
  url: string,
  options: RequestInit,
  wallet: Wallet
): Promise<{ response: Response; paid: boolean; cost: string | null }> {
  const resp = await fetch(url, options);

  if (resp.status !== 402) {
    return { response: resp, paid: false, cost: null };
  }

  // Parse payment requirements from header or body
  let paymentRequired: PaymentRequired | null = null;
  const header = resp.headers.get("payment-required");
  if (header) {
    try {
      paymentRequired = JSON.parse(atob(header));
    } catch {
      paymentRequired = null;
    }
  }
  if (!paymentRequired) {
    try {
      paymentRequired = await resp.json();
    } catch {
      return { response: resp, paid: false, cost: null };
    }
  }

  const requirements = paymentRequired?.accepts?.[0];
  if (!requirements) {
    return { response: resp, paid: false, cost: null };
  }

  // Sign and retry
  const paymentPayload = await signPayment(requirements, wallet);
  const paymentHeader = btoa(JSON.stringify(paymentPayload));

  const paidResp = await fetch(url, {
    ...options,
    headers: {
      ...(options.headers as Record<string, string>),
      "X-PAYMENT": paymentHeader,
    },
  });

  // Cost in human-readable dollars (amount is in USDC micro-units, 1e6 = $1)
  const costDollars = (parseInt(requirements.amount) / 1_000_000).toFixed(6);

  return { response: paidResp, paid: true, cost: costDollars };
}

export function parsePaymentPreview(resp: Response): { amount: string; asset: string; payTo: string } | null {
  const header = resp.headers.get("payment-required");
  if (!header) return null;
  try {
    const pr: PaymentRequired = JSON.parse(atob(header));
    const req = pr.accepts?.[0];
    if (!req) return null;
    return {
      amount: (parseInt(req.amount) / 1_000_000).toFixed(6),
      asset: req.asset,
      payTo: req.payTo,
    };
  } catch {
    return null;
  }
}
