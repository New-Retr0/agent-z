import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rateLimitFindMany: vi.fn(),
  limitFn: vi.fn(),
}));

vi.mock("@repo/db", () => ({
  prisma: {
    rateLimit: { findMany: mocks.rateLimitFindMany },
  },
}));

vi.mock("@upstash/redis", () => ({
  Redis: class FakeRedis {
    constructor() {}
  },
}));

vi.mock("@upstash/ratelimit", () => {
  return {
    Ratelimit: class FakeRatelimit {
      static slidingWindow(_n: number, _w: string) {
        return { _n, _w };
      }
      limit = mocks.limitFn;
      constructor() {}
    },
  };
});

describe("applyAgentRateLimit", () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...ORIGINAL_ENV, KV_REST_API_URL: "https://x", KV_REST_API_TOKEN: "y" };
    mocks.rateLimitFindMany.mockResolvedValue([]);
    mocks.limitFn.mockResolvedValue({ success: true });
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
    vi.resetModules();
  });

  it("allows when no limits are configured", async () => {
    const { applyAgentRateLimit } = await import("./rate-limit");
    await expect(applyAgentRateLimit("user-1")).resolves.toEqual({ allowed: true });
    expect(mocks.limitFn).not.toHaveBeenCalled();
  });

  it("denies when the user per-minute limit is exceeded", async () => {
    mocks.rateLimitFindMany.mockResolvedValue([{ kind: "user_rpm", value: 5, bypassUserIds: [] }]);
    mocks.limitFn.mockResolvedValueOnce({ success: false });

    const { applyAgentRateLimit } = await import("./rate-limit");
    await expect(applyAgentRateLimit("user-1")).resolves.toEqual({
      allowed: false,
      reason: "Agent Z is rate limited for this user. Try again in a minute.",
    });
    expect(mocks.limitFn).toHaveBeenCalledWith("user:user-1");
  });

  it("denies on global limit with the matching reason", async () => {
    mocks.rateLimitFindMany.mockResolvedValue([{ kind: "global_rpm", value: 100, bypassUserIds: [] }]);
    mocks.limitFn.mockResolvedValueOnce({ success: false });

    const { applyAgentRateLimit } = await import("./rate-limit");
    await expect(applyAgentRateLimit("user-1")).resolves.toEqual({
      allowed: false,
      reason: "Agent Z is rate limited globally. Try again in a minute.",
    });
    expect(mocks.limitFn).toHaveBeenCalledWith("global");
  });

  it("honors bypass users without consulting Redis", async () => {
    mocks.rateLimitFindMany.mockResolvedValue([{ kind: "user_rpm", value: 1, bypassUserIds: ["user-1"] }]);

    const { applyAgentRateLimit } = await import("./rate-limit");
    await expect(applyAgentRateLimit("user-1")).resolves.toEqual({ allowed: true });
    expect(mocks.limitFn).not.toHaveBeenCalled();
  });

  it("denies closed when policy cannot be read", async () => {
    mocks.rateLimitFindMany.mockRejectedValue(new Error("db down"));

    const { applyAgentRateLimit } = await import("./rate-limit");
    await expect(applyAgentRateLimit("user-1")).resolves.toEqual({
      allowed: false,
      reason: "Rate limit policy is unavailable.",
    });
  });

  it("fails open when Redis is not configured", async () => {
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;
    mocks.rateLimitFindMany.mockResolvedValue([{ kind: "user_rpm", value: 5, bypassUserIds: [] }]);

    const { applyAgentRateLimit } = await import("./rate-limit");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(applyAgentRateLimit("user-1")).resolves.toEqual({ allowed: true });
    expect(warn).toHaveBeenCalledWith("[rate-limit] Redis not configured; skipping user_rpm.");
    warn.mockRestore();
  });
});
