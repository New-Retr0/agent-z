import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  afterTasks: [] as Promise<unknown>[],
  after: vi.fn((task: Promise<unknown> | (() => unknown)) => {
    const promise = typeof task === "function" ? Promise.resolve().then(task) : Promise.resolve(task);
    mocks.afterTasks.push(promise);
  }),
  verifyKey: vi.fn(),
  discordWebhook: vi.fn(),
  runDirectAgentZ: vi.fn(),
  handleWorkflowAction: vi.fn(),
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

vi.mock("@/lib/agent-z/direct", () => ({
  runDirectAgentZ: mocks.runDirectAgentZ,
}));

vi.mock("@/lib/agent-z/workflow-actions", () => ({
  parseWorkflowActionCustomId: (customId: string | undefined) => {
    const match = customId?.match(/^agentz:(start|cancel):(.+)$/);
    return match ? { action: match[1], token: match[2] } : null;
  },
  handleWorkflowAction: mocks.handleWorkflowAction,
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
    process.env.AGENT_Z_INTERNAL_SECRET = "internal-secret";
    mocks.runDirectAgentZ.mockResolvedValue({ kind: "answer", text: "Hello from Agent Z." });
    mocks.handleWorkflowAction.mockResolvedValue({ text: "Started reminder workflow.", components: [] });
  });

  it("handles agent-z-admin as a native ephemeral interaction", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          started: true,
          runId: "workflow-run",
          agentRunId: "12345678-1234-1234-1234-123456789012",
          tier: "mod",
        })
      )
      .mockResolvedValueOnce(Response.json({ id: "original" }));
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
    expect(fetchMock).toHaveBeenCalledWith(
      new URL("https://agent.test/api/workflow/invoke"),
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer internal-secret" }),
      })
    );
    expect(JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body))).toMatchObject({
      requiredTier: "mod",
      replyTarget: {
        _type: "discord:Interaction",
        applicationId: "1495910562360594452",
        interactionToken: "interaction-token",
      },
    });
    expect(fetchMock).toHaveBeenLastCalledWith(
      "https://discord.com/api/v10/webhooks/1495910562360594452/interaction-token/messages/@original",
      expect.objectContaining({ method: "PATCH" })
    );
    expect(JSON.parse(String((fetchMock.mock.calls[1][1] as RequestInit).body))).toMatchObject({
      content: "I'm on it. I'll send the staff-only answer here when it's ready.",
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

    expect(mocks.runDirectAgentZ).toHaveBeenCalledWith({
      prompt: "hello",
      invokerUserId: "100000000000000000",
      discordContext: {
        guildId: "1488609972676984894",
        channelId: "1496580126601646150",
        roleIds: [],
        isDirectMessage: false,
      },
      replyTarget: {
        _type: "discord:Channel",
        channelId: "1496580126601646150",
      },
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
