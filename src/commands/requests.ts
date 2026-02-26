import { apiGet, apiPost, parsePositiveInt } from "../lib/api.js";
import { outputJson, log } from "../lib/output.js";
import type { AuthContext } from "../lib/auth.js";

export async function runList(
  opts: { status?: string; page?: string; perPage?: string },
  auth: AuthContext,
  compact: boolean
): Promise<void> {
  const params = new URLSearchParams();
  if (opts.status) params.set("status", opts.status);

  if (opts.page) {
    const p = parsePositiveInt(opts.page, "page");
    if (p === null) process.exit(1);
    params.set("page", String(p));
  }
  if (opts.perPage) {
    const pp = parsePositiveInt(opts.perPage, "per-page");
    if (pp === null) process.exit(1);
    params.set("per_page", String(pp));
  }

  const qs = params.toString();
  const data = await apiGet(
    `/api/tool-requests${qs ? `?${qs}` : ""}`,
    auth
  );
  outputJson(data, compact);
}

export async function runRequest(
  opts: {
    title?: string;
    desc?: string;
    useCase?: string;
    exec?: string;
    agentId?: string;
  },
  auth: AuthContext,
  compact: boolean
): Promise<void> {
  if (!opts.title || !opts.desc) {
    log("Usage: caravo request --title <title> --desc <description>");
    process.exit(1);
  }

  const body: Record<string, unknown> = {
    title: opts.title,
    description: opts.desc,
  };
  if (opts.useCase) body.use_case = opts.useCase;
  if (opts.exec) body.execution_id = opts.exec;
  if (opts.agentId) body.agent_id = opts.agentId;

  const { data } = await apiPost("/api/tool-requests", body, auth);
  outputJson(data, compact);
}

export async function runUpvote(
  reqId: string | undefined,
  execId: string | undefined,
  auth: AuthContext,
  compact: boolean
): Promise<void> {
  if (!reqId) {
    log("Usage: caravo request-upvote <request-id> [--exec <execution-id>]");
    process.exit(1);
  }

  const body: Record<string, unknown> = {};
  if (execId) body.execution_id = execId;

  const { data } = await apiPost(`/api/tool-requests/${reqId}`, body, auth);
  outputJson(data, compact);
}
