import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rateLimitFindMany: vi.fn(),
  agentRunCount: vi.fn(),
}));

vi.mock("@repo/db", () => ({
  prisma: {
    rateLimit: { findMany: mocks.rateLimitFindMany },
    agentRun: { count: mocks.agentRunCount },
  },
}));

import { resolveWorkflowRateLimit } from "./rate-limit";

describe("resolveWorkflowRateLimit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rateLimitFindMany.mockResolvedValue([]);
    mocks.agentRunCount.mockResolvedValue(0);
  });

  it("allows when no limits are configured", async () => {
    await expect(resolveWorkflowRateLimit("user-1")).resolves.toEqual({ allowed: true });
    expect(mocks.agentRunCount).not.toHaveBeenCalled();
  });

  it("denies when the user per-minute limit is reached", async () => {
    mocks.rateLimitFindMany.mockResolvedValue([{ kind: "user_rpm", value: 1, bypassUserIds: [] }]);
    mocks.agentRunCount.mockResolvedValue(1);

    await expect(resolveWorkflowRateLimit("user-1")).resolves.toEqual({
      allowed: false,
      reason: "Agent Z is rate limited for this user. Try again in a minute.",
    });
    expect(mocks.agentRunCount).toHaveBeenCalledWith({
      where: {
        invokerUserId: "user-1",
        startedAt: { gte: expect.any(Date) },
      },
    });
  });

  it("honors bypass users", async () => {
    mocks.rateLimitFindMany.mockResolvedValue([{ kind: "user_rpm", value: 1, bypassUserIds: ["user-1"] }]);

    await expect(resolveWorkflowRateLimit("user-1")).resolves.toEqual({ allowed: true });
    expect(mocks.agentRunCount).not.toHaveBeenCalled();
  });

  it("denies closed when policy cannot be read", async () => {
    mocks.rateLimitFindMany.mockRejectedValue(new Error("db down"));

    await expect(resolveWorkflowRateLimit("user-1")).resolves.toEqual({
      allowed: false,
      reason: "Rate limit policy is unavailable.",
    });
  });
});

