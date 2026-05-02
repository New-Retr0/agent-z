import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { invokeAgentWorkflow } from "./invoke-workflow";

const input = {
  prompt: "hello",
  invokerUserId: "100000000000000000",
  discordContext: {
    guildId: "200000000000000000",
    channelId: "300000000000000000",
    roleIds: [],
    isDirectMessage: false,
  },
  replyTarget: {
    _type: "chat:Channel" as const,
    adapterName: "discord",
    id: "discord:200000000000000000:300000000000000000",
    isDM: false,
  },
};

describe("invokeAgentWorkflow", () => {
  beforeEach(() => {
    process.env.AGENT_Z_INTERNAL_SECRET = "x".repeat(16);
    delete process.env.AGENT_Z_APP_BASE_URL;
    delete process.env.VERCEL_URL;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.AGENT_Z_INTERNAL_SECRET;
    delete process.env.AGENT_Z_APP_BASE_URL;
    delete process.env.VERCEL_URL;
  });

  it("posts to the configured app base URL with the internal secret", async () => {
    process.env.AGENT_Z_APP_BASE_URL = "https://agent.example.com/";
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ runId: "workflow-run", agentRunId: "agent-run", tier: "admin" }), {
        status: 200,
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(invokeAgentWorkflow(input)).resolves.toEqual({
      runId: "workflow-run",
      agentRunId: "agent-run",
      tier: "admin",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://agent.example.com/api/workflow/invoke",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: `Bearer ${"x".repeat(16)}`,
          "Content-Type": "application/json",
        }),
      })
    );
  });

  it("passes an optional required tier for staff commands", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ runId: "workflow-run", agentRunId: "agent-run", tier: "mod" }), {
        status: 200,
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    await invokeAgentWorkflow({ ...input, requiredTier: "mod" });

    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(String(init.body))).toMatchObject({ requiredTier: "mod" });
  });

  it("passes an optional max tier for public commands", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ runId: "workflow-run", agentRunId: "agent-run", tier: "verified" }), {
        status: 200,
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    await invokeAgentWorkflow({ ...input, maxTier: "verified" });

    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(String(init.body))).toMatchObject({ maxTier: "verified" });
  });

  it("falls back to VERCEL_URL before localhost", async () => {
    process.env.VERCEL_URL = "agent-z.vercel.app";
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ runId: "workflow-run", agentRunId: "agent-run", tier: "public" }), {
        status: 200,
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    await invokeAgentWorkflow(input);

    expect(fetchMock).toHaveBeenCalledWith("https://agent-z.vercel.app/api/workflow/invoke", expect.any(Object));
  });

  it("raises a useful error from JSON error bodies", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "Agent Z is not enabled in this channel." }), { status: 403 }))
    );

    await expect(invokeAgentWorkflow(input)).rejects.toThrow("Agent Z is not enabled in this channel.");
  });

  it("requires the internal secret before calling fetch", async () => {
    delete process.env.AGENT_Z_INTERNAL_SECRET;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(invokeAgentWorkflow(input)).rejects.toThrow("Missing AGENT_Z_INTERNAL_SECRET");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

