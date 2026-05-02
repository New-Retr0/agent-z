import { prisma } from "@repo/db";

export type RateLimitDecision =
  | { allowed: true }
  | { allowed: false; reason: string };

const USER_RPM = "user_rpm";
const GLOBAL_RPM = "global_rpm";

/**
 * Enforces lightweight per-minute limits configured in `/admin/config`.
 *
 * Supported `RateLimit.kind` values:
 * - `user_rpm`: max runs per invoker user in the last minute
 * - `global_rpm`: max total runs in the last minute
 */
export async function resolveWorkflowRateLimit(invokerUserId: string): Promise<RateLimitDecision> {
  let limits: Array<{ kind: string; value: number; bypassUserIds: string[] }> = [];
  try {
    limits = await prisma.rateLimit.findMany({
      where: { kind: { in: [USER_RPM, GLOBAL_RPM] } },
      select: { kind: true, value: true, bypassUserIds: true },
    });
  } catch {
    return { allowed: false, reason: "Rate limit policy is unavailable." };
  }

  if (limits.length === 0) {
    return { allowed: true };
  }

  const since = new Date(Date.now() - 60_000);
  for (const limit of limits) {
    if (limit.value <= 0 || limit.bypassUserIds.includes(invokerUserId)) {
      continue;
    }

    const where =
      limit.kind === USER_RPM
        ? { invokerUserId, startedAt: { gte: since } }
        : { startedAt: { gte: since } };
    const count = await prisma.agentRun.count({ where });
    if (count >= limit.value) {
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

