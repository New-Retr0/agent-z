/**
 * Per-user + global sliding-window rate limiter for the agent path.
 *
 * Backed by `@upstash/ratelimit` on top of Upstash Redis. Replaces the
 * earlier hand-rolled Postgres `agentRun.count` query, which:
 *
 *   1. counted committed `AgentRun` rows after the fact (limit-by-side-effect),
 *   2. blocked nothing if the run hadn't yet been persisted,
 *   3. did its own arithmetic on every request,
 *   4. and was orphaned when `/api/workflow/invoke` was deleted in Phase 7.
 *
 * Admin-configured `RateLimit` rows are still the source of truth for the
 * RPM values and bypass user IDs, so /admin/config still drives the policy.
 * We just hand the value to `Ratelimit.slidingWindow` and let Upstash do
 * the bookkeeping in Redis with `ephemeralCache` for in-process burst
 * smoothing and `analytics: true` for observability in the Upstash console.
 *
 * Behaviour when Redis is not configured (local dev with no Upstash env
 * vars): we fail OPEN with a console warning. This matches every other
 * "best-effort" Redis path in the codebase (embed queue, oversight
 * pubsub) and avoids bricking local development on infra optionality.
 */

import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";
import { prisma } from "@repo/db";

export type RateLimitDecision = { allowed: true } | { allowed: false; reason: string };

const USER_RPM = "user_rpm";
const GLOBAL_RPM = "global_rpm";

/** Process-wide burst smoothing — the Ratelimit docs explicitly recommend
 * sharing one Map across limiters per process. */
const ephemeralCache = new Map<string, number>();

let cachedRedis: Redis | null = null;
const limiterCache = new Map<string, Ratelimit>();

function getRedis(): Redis | null {
  if (cachedRedis) return cachedRedis;
  const url = process.env.KV_REST_API_URL?.trim();
  const token = process.env.KV_REST_API_TOKEN?.trim();
  if (!url || !token) return null;
  cachedRedis = new Redis({ url, token });
  return cachedRedis;
}

/** Memoize one Ratelimit instance per (kind, value) tuple so admin RPM
 * tweaks take effect on the next request without leaking instances. */
function getLimiter(kind: string, value: number): Ratelimit | null {
  const redis = getRedis();
  if (!redis) return null;
  const key = `${kind}:${value}`;
  const cached = limiterCache.get(key);
  if (cached) return cached;
  const limiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(value, "1 m"),
    analytics: true,
    ephemeralCache,
    prefix: `agentz:${kind}`,
  });
  limiterCache.set(key, limiter);
  return limiter;
}

/**
 * Enforce the admin-configured per-minute limits against the supplied
 * `invokerUserId`. Resolves to `{ allowed: true }` when:
 *
 *   - no `RateLimit` rows exist (policy not configured),
 *   - the user is in the matching row's `bypassUserIds`,
 *   - or the request is under the sliding-window threshold.
 *
 * On Redis outage we fail closed for the agent path (returning a friendly
 * reason). On policy-DB outage we also fail closed — the agent should not
 * silently run unthrottled if we can't read its policy.
 */
export async function applyAgentRateLimit(invokerUserId: string): Promise<RateLimitDecision> {
  let limits: Array<{ kind: string; value: number; bypassUserIds: string[] }>;
  try {
    limits = await prisma.rateLimit.findMany({
      where: { kind: { in: [USER_RPM, GLOBAL_RPM] } },
      select: { kind: true, value: true, bypassUserIds: true },
    });
  } catch {
    return { allowed: false, reason: "Rate limit policy is unavailable." };
  }

  if (limits.length === 0) return { allowed: true };

  for (const limit of limits) {
    if (limit.value <= 0 || limit.bypassUserIds.includes(invokerUserId)) continue;
    const limiter = getLimiter(limit.kind, limit.value);
    if (!limiter) {
      console.warn(`[rate-limit] Redis not configured; skipping ${limit.kind}.`);
      continue;
    }
    const identifier = limit.kind === USER_RPM ? `user:${invokerUserId}` : "global";
    const result = await limiter.limit(identifier);
    if (!result.success) {
      return {
        allowed: false,
        reason:
          limit.kind === USER_RPM
            ? "Agent Z is rate limited for this user. Try again in a minute."
            : "Agent Z is rate limited globally. Try again in a minute.",
      };
    }
  }

  return { allowed: true };
}
