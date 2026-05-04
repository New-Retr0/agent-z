import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  afterTasks: [] as Promise<unknown>[],
  after: vi.fn((task: Promise<unknown> | (() => unknown)) => {
    const promise = typeof task === "function" ? Promise.resolve().then(task) : Promise.resolve(task);
    mocks.afterTasks.push(promise);
  }),
  verifyKey: vi.fn(),
  discordWebhook: vi.fn(),
  runAgentZ: vi.fn(),
  applyAgentRateLimit: vi.fn(),
  resolveDiscordAccess: vi.fn(),
}));

vi.mock("next/server", () => ({
  after: mocks.after,
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) => Response.json(body, init),
  },
}));

vi.mock("discord-interactions", () => ({
  verifyKey: mocks.verifyKey,
}));

vi.mock("@repo/chat-bot", () => ({
  getBot: () => ({
    webhooks: {
      discord: mocks.discordWebhook,
    },
  }),
}));

vi.mock("@/lib/agent-z/run", () => ({
  runAgentZ: mocks.runAgentZ,
}));

vi.mock("@/lib/rate-limit", () => ({
  applyAgentRateLimit: mocks.applyAgentRateLimit,
}));

vi.mock("@/lib/discord-access", () => ({
  resolveDiscordAccess: mocks.resolveDiscordAccess,
}));

import { POST } from "./route";

function signedRequest(body: unknown) {
  return new Request("https://agent.test/api/discord", {
    method: "POST",
    headers: {
      "x-signature-ed25519": "signature",
      "x-signature-timestamp": "timestamp",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

describe("Discord route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.afterTasks.length = 0;
    mocks.verifyKey.mockResolvedValue(true);
    mocks.discordWebhook.mockResolvedValue(Response.json({ ok: true }));
    process.env.DISCORD_PUBLIC_KEY = "public-key";
    process.env.DISCORD_APPLICATION_ID = "1495910562360594452";
    process.env.DISCORD_BOT_TOKEN = "bot-token";
    process.env.DATABASE_URL = "postgres://test";
    process.env.AGENT_Z_INTERNAL_SECRET = "internal-secret-16chr";
    mocks.runAgentZ.mockResolvedValue({ text: "Hello from Agent Z." });
    mocks.applyAgentRateLimit.mockResolvedValue({ allowed: true });
    mocks.resolveDiscordAccess.mockResolvedValue({ allowed: true, tier: "mod" });
  });

  it("handles agent-z-admin as a native ephemeral interaction", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(Response.json({ id: "original" }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(
      signedRequest({
        type: 2,
        token: "interaction-token",
        guild_id: "1488609972676984894",
        channel_id: "1496580126601646150",
        data: {
          name: "agent-z-admin",
          options: [{ name: "action", value: "check recent messages" }],
        },
        member: {
          user: { id: "100000000000000000" },
          roles: ["1496580080917414040"],
        },
      })
    );

    await expect(response.json()).resolves.toEqual({
      type: 5,
      data: { flags: 64 },
    });

    await Promise.all(mocks.afterTasks);
    expect(mocks.runAgentZ).toHaveBeenCalledWith({
      prompt: "check recent messages",
      invokerUserId: "100000000000000000",
      discordContext: {
        guildId: "1488609972676984894",
        channelId: "1496580126601646150",
        roleIds: ["1496580080917414040"],
        isDirectMessage: false,
        invokerUserId: "100000000000000000",
      },
      surface: "admin",
      discordInteraction: {
        token: "interaction-token",
        applicationId: "1495910562360594452",
      },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://discord.com/api/v10/webhooks/1495910562360594452/interaction-token/messages/@original",
      expect.objectContaining({ method: "PATCH" })
    );
    expect(JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body))).toMatchObject({
      content: "Hello from Agent Z.",
      flags: 64,
    });
    expect(mocks.discordWebhook).not.toHaveBeenCalled();
  });

  it("defers agent-z immediately then answers through the direct path in after()", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(Response.json({ id: "original" }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(
      signedRequest({
        type: 2,
        token: "interaction-token",
        guild_id: "1488609972676984894",
        channel_id: "1496580126601646150",
        data: {
          name: "agent-z",
          options: [{ name: "text", value: "hello" }],
        },
        member: {
          user: { id: "100000000000000000" },
          roles: [],
        },
      })
    );

    await expect(response.json()).resolves.toEqual({
      type: 5,
      data: { flags: 0 },
    });
    expect(mocks.discordWebhook).not.toHaveBeenCalled();

    await Promise.all(mocks.afterTasks);

    expect(mocks.runAgentZ).toHaveBeenCalledWith({
      prompt: "hello",
      invokerUserId: "100000000000000000",
      discordContext: {
        guildId: "1488609972676984894",
        channelId: "1496580126601646150",
        roleIds: [],
        isDirectMessage: false,
        invokerUserId: "100000000000000000",
      },
      surface: "public",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://discord.com/api/v10/webhooks/1495910562360594452/interaction-token/messages/@original",
      expect.objectContaining({ method: "PATCH" })
    );
    expect(JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body))).toMatchObject({
      content: "Hello from Agent Z.",
      flags: 0,
      components: [],
    });
  });

  it("PING succeeds with only DISCORD_PUBLIC_KEY (Discord URL verification)", async () => {
    delete process.env.DATABASE_URL;
    delete process.env.DISCORD_APPLICATION_ID;
    delete process.env.DISCORD_BOT_TOKEN;
    process.env.DISCORD_PUBLIC_KEY = "public-key";

    const response = await POST(signedRequest({ type: 1 }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ type: 1 });
  });

  it("returns 503 for interactions other than PING when DATABASE_URL is missing", async () => {
    delete process.env.DATABASE_URL;

    const response = await POST(
      signedRequest({
        type: 2,
        token: "t",
        channel_id: "c",
        data: { name: "agent-z", options: [{ name: "text", value: "hi" }] },
        member: { user: { id: "100000000000000000" }, roles: [] },
      })
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ error: expect.any(String), missing: expect.arrayContaining(["DATABASE_URL"]) });
  });

  it("delegates other commands to Chat SDK", async () => {
    const response = await POST(
      signedRequest({
        type: 2,
        data: { name: "some-other-command" },
      })
    );

    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(mocks.discordWebhook).toHaveBeenCalled();
  });
});
