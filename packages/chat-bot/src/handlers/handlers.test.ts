import { beforeEach, describe, expect, it, vi } from "vitest";
import { onAction } from "./action";
import { onDirectMessage } from "./dm";
import { onMention } from "./mention";
import { onReaction } from "./reaction";
import { onSlash } from "./slash";

const mocks = vi.hoisted(() => ({
  invokeAgentWorkflow: vi.fn(),
  getMentionDiscordContext: vi.fn(),
  getMentionReplyTarget: vi.fn(),
  getSlashDiscordContext: vi.fn(),
  getSlashReplyTarget: vi.fn(),
}));

vi.mock("../invoke-workflow", () => ({
  invokeAgentWorkflow: mocks.invokeAgentWorkflow,
}));

vi.mock("../discord-context", () => ({
  getMentionDiscordContext: mocks.getMentionDiscordContext,
  getMentionReplyTarget: mocks.getMentionReplyTarget,
  getSlashDiscordContext: mocks.getSlashDiscordContext,
  getSlashReplyTarget: mocks.getSlashReplyTarget,
}));

function channel() {
  return {
    post: vi.fn(),
    toJSON: vi.fn(() => ({
      _type: "chat:Channel",
      adapterName: "discord",
      id: "discord:guild:channel",
      isDM: false,
    })),
  };
}

describe("chat-bot handlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.invokeAgentWorkflow.mockResolvedValue({
      runId: "workflow-run",
      agentRunId: "12345678-1234-1234-1234-123456789012",
      tier: "admin",
    });
    mocks.getSlashDiscordContext.mockReturnValue({ roleIds: [], isDirectMessage: false });
    mocks.getMentionDiscordContext.mockReturnValue({ roleIds: [], isDirectMessage: false });
    mocks.getSlashReplyTarget.mockReturnValue({ _type: "discord:Channel", channelId: "channel" });
    mocks.getMentionReplyTarget.mockReturnValue({ _type: "discord:Channel", channelId: "channel", messageId: "message" });
  });

  it("answers slash help without invoking the workflow", async () => {
    const handlers = new Map<string, (event: any) => Promise<void>>();
    onSlash({ onSlashCommand: vi.fn((name, handler) => handlers.set(name, handler)) } as any);
    const event = { text: "help", channel: channel(), user: { userId: "user" } };

    await handlers.get("agent-z")?.(event);

    expect(mocks.invokeAgentWorkflow).not.toHaveBeenCalled();
    expect(event.channel.post).toHaveBeenCalledWith(
      expect.objectContaining({ markdown: expect.stringContaining("Use `/agent-z text:<question>`") })
    );
  });

  it("starts a workflow for slash prompts", async () => {
    const handlers = new Map<string, (event: any) => Promise<void>>();
    onSlash({ onSlashCommand: vi.fn((name, handler) => handlers.set(name, handler)) } as any);
    const event = { text: " audit the server ", channel: channel(), user: { userId: "user-1" } };

    await handlers.get("agent-z")?.(event);

    expect(mocks.invokeAgentWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: "audit the server",
        invokerUserId: "user-1",
        maxTier: "verified",
        replyTarget: expect.objectContaining({ _type: "discord:Channel" }),
      })
    );
    expect(event.channel.post).toHaveBeenCalledWith(
      expect.objectContaining({ markdown: expect.stringContaining("thinking") })
    );
  });

  it("starts a workflow for mentions after stripping the bot mention", async () => {
    const handlers: Array<(thread: any, message: any) => Promise<void>> = [];
    onMention({ onNewMention: vi.fn((handler) => handlers.push(handler)), onSubscribedMessage: vi.fn() } as any);
    const thread = {
      post: vi.fn(),
      subscribe: vi.fn(),
      toJSON: vi.fn(() => ({
        _type: "chat:Thread",
        adapterName: "discord",
        id: "thread",
        channelId: "discord:guild:channel",
        isDM: false,
      })),
    };
    const message = { text: "<@123456789012345678> summarize this", author: { userId: "user-1" }, raw: {} };

    await handlers[0](thread, message);

    expect(mocks.invokeAgentWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: "summarize this",
        maxTier: "verified",
        replyTarget: expect.objectContaining({ _type: "discord:Channel" }),
      })
    );
    expect(thread.subscribe).toHaveBeenCalled();
    expect(thread.post).toHaveBeenCalledWith(expect.stringContaining("I'll reply here"));
  });

  it("continues subscribed conversations", async () => {
    const handlers: Array<(thread: any, message: any) => Promise<void>> = [];
    onMention({ onNewMention: vi.fn(), onSubscribedMessage: vi.fn((handler) => handlers.push(handler)) } as any);
    const thread = {
      post: vi.fn(),
      toJSON: vi.fn(() => ({
        _type: "chat:Thread",
        adapterName: "discord",
        id: "thread",
        channelId: "discord:guild:channel",
        isDM: false,
      })),
    };
    const message = { text: "what now?", author: { userId: "user-1" }, raw: { id: "message", author: { bot: false } } };

    await handlers[0](thread, message);

    expect(mocks.invokeAgentWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: "what now?",
        maxTier: "verified",
        replyTarget: expect.objectContaining({ _type: "discord:Channel" }),
      })
    );
    expect(thread.post).toHaveBeenCalledWith(expect.stringContaining("I'll reply here"));
  });

  it("keeps DMs guild-only and does not invoke workflows", async () => {
    const handlers: Array<(thread: any) => Promise<void>> = [];
    onDirectMessage({ onDirectMessage: vi.fn((handler) => handlers.push(handler)) } as any);
    const thread = { post: vi.fn() };

    await handlers[0](thread);

    expect(mocks.invokeAgentWorkflow).not.toHaveBeenCalled();
    expect(thread.post).toHaveBeenCalledWith(expect.stringContaining("server only"));
  });

  it("does not mutate on reactions", async () => {
    const handlers: Array<(event: any) => Promise<void>> = [];
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    onReaction({ onReaction: vi.fn((_emojis, handler) => handlers.push(handler)) } as any);

    await handlers[0]({ rawEmoji: "✅" });

    expect(mocks.invokeAgentWorkflow).not.toHaveBeenCalled();
    expect(info).toHaveBeenCalledWith("[chat-bot] reaction automation is disabled", { emoji: "✅" });
  });

  it("rejects Discord confirmation actions with admin guidance", async () => {
    const handlers: Array<(event: any) => Promise<void>> = [];
    onAction({ onAction: vi.fn((handler) => handlers.push(handler)) } as any);
    const event = { actionId: "confirm:123", thread: { post: vi.fn() } };

    await handlers[0](event);

    expect(event.thread.post).toHaveBeenCalledWith(expect.stringContaining("admin confirmations page"));
  });
});

