import { apiPost } from "../lib/api.js";
import { outputJson, log } from "../lib/output.js";
import type { AuthContext } from "../lib/auth.js";

export async function runReview(
  execId: string | undefined,
  opts: { rating?: string; comment?: string; agentId?: string },
  auth: AuthContext,
  compact: boolean
): Promise<void> {
  if (!execId) {
    log("Usage: caravo review <execution-id> --rating <1-5> --comment <text>");
    process.exit(1);
  }
  if (!opts.rating || !opts.comment) {
    log("--rating and --comment are required");
    process.exit(1);
  }

  // Reject floats like "3.5" — parseInt would silently truncate to 3
  if (opts.rating !== String(parseInt(opts.rating, 10))) {
    log("--rating must be an integer 1-5");
    process.exit(1);
  }
  const rating = parseInt(opts.rating, 10);
  if (isNaN(rating) || rating < 1 || rating > 5) {
    log("--rating must be an integer 1-5");
    process.exit(1);
  }

  const body: Record<string, unknown> = {
    execution_id: execId,
    rating,
    comment: opts.comment,
  };
  if (opts.agentId) body.agent_id = opts.agentId;

  const { data } = await apiPost("/api/reviews", body, auth);
  outputJson(data, compact);
}

export async function runUpvote(
  reviewId: string | undefined,
  execId: string | undefined,
  auth: AuthContext,
  compact: boolean
): Promise<void> {
  if (!reviewId || !execId) {
    log("Usage: caravo upvote <review-id> --exec <execution-id>");
    process.exit(1);
  }

  const body = {
    review_id: reviewId,
    execution_id: execId,
  };

  const { data } = await apiPost("/api/reviews/upvote", body, auth);
  outputJson(data, compact);
}
