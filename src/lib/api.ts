import { fetchWithX402 } from "../x402.js";
import { log } from "./output.js";
import type { AuthContext } from "./auth.js";

/** Normalize a tool ID: trim whitespace, strip trailing slashes, lowercase. */
export function normalizeToolId(toolId: string): string {
  return toolId.trim().replace(/\/+$/, "").toLowerCase();
}

/** Validate tool_id format: only allow safe chars, no path traversal. */
export function validateToolId(toolId: string): string | null {
  const trimmed = normalizeToolId(toolId);
  if (!trimmed) return "tool_id must not be empty";
  if (trimmed.includes("..")) return "Invalid tool_id: path traversal not allowed";
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_./-]*$/.test(trimmed)) {
    return "Invalid tool_id format: must start with alphanumeric and contain only letters, numbers, hyphens, underscores, dots, and slashes";
  }
  if (trimmed.length > 200) return "tool_id too long";
  return null;
}

/** Check if API response is an error and set process exit code accordingly. */
export function checkResponseError(data: unknown, httpStatus: number): boolean {
  if (httpStatus >= 400) {
    process.exitCode = 1;
    return true;
  }
  if (data && typeof data === "object" && "error" in data) {
    process.exitCode = 1;
    return true;
  }
  return false;
}

export async function apiGet(
  path: string,
  auth: AuthContext
): Promise<unknown> {
  const r = await fetch(`${auth.baseUrl}${path}`, { headers: auth.headers() });
  const data = await r.json();
  checkResponseError(data, r.status);
  return data;
}

export async function apiPost(
  path: string,
  body: unknown,
  auth: AuthContext
): Promise<{ data: unknown; paid: boolean; cost: string | null }> {
  const url = `${auth.baseUrl}${path}`;
  const opts: RequestInit = {
    method: "POST",
    headers: auth.headers(),
    body: JSON.stringify(body),
  };

  if (auth.mode === "x402") {
    const { response, paid, cost } = await fetchWithX402(url, opts, auth.wallet);
    if (paid) log(`paid $${cost} via x402`);
    const data = await response.json();
    checkResponseError(data, response.status);
    return { data, paid, cost };
  }

  const r = await fetch(url, opts);
  const data = await r.json();
  checkResponseError(data, r.status);
  return { data, paid: false, cost: null };
}

export async function apiDelete(
  path: string,
  body: unknown,
  auth: AuthContext
): Promise<unknown> {
  const r = await fetch(`${auth.baseUrl}${path}`, {
    method: "DELETE",
    headers: auth.headers(),
    body: JSON.stringify(body),
  });
  const data = await r.json();
  checkResponseError(data, r.status);
  return data;
}

/** Validate a string is a positive integer. Returns the parsed int or null. */
export function parsePositiveInt(value: string, name: string): number | null {
  if (value !== String(parseInt(value, 10))) {
    log(`--${name} must be a positive integer`);
    return null;
  }
  const n = parseInt(value, 10);
  if (isNaN(n) || n < 1) {
    log(`--${name} must be a positive integer`);
    return null;
  }
  return n;
}
