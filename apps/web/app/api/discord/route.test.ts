import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  afterTasks: [] as Promise<unknown>[],
  after: vi.fn((task: Promise<unknown> | (() => unknown)) => {
    const promise = typeof task === "function" ? Promise.resolve().then(task) : Promise.resolve(task);
    mocks.afterTasks.push(promise);
  }),
  verifyKey: vi.fn(),
  discordWebhook: vi.fn(),
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

    await Promise.all(mocks.afterTasks);

    await expect(response.json()).resolves.toEqual({
      type: 5,
      data: { flags: 64 },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      new URL("https://agent.test/api/workflow/invoke"),
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer internal-secret" }),
      })
    );
    expect(JSON.parse(String(fetchMock.mock.calls[0][1].body))).toMatchObject({
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
    expect(mocks.discordWebhook).not.toHaveBeenCalled();
  });

  it("delegates non-admin commands to Chat SDK", async () => {
    const response = await POST(
      signedRequest({
        type: 2,
        data: { name: "agent-z" },
      })
    );

    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(mocks.discordWebhook).toHaveBeenCalled();
  });
});
