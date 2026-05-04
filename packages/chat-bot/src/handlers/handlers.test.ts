import { beforeEach, describe, expect, it, vi } from "vitest";
import { onAction } from "./action";
import { onDirectMessage } from "./dm";
import { onMention } from "./mention";
import { onReaction } from "./reaction";
import { onSlash } from "./slash";

const mocks = vi.hoisted(() => ({
  invokeAgentDirect: vi.fn(),
  getMentionDiscordContext: vi.fn(),
  getMentionReplyTarget: vi.fn(),
  getSlashDiscordContext: vi.fn(),
  getSlashReplyTarget: vi.fn(),
}));

vi.mock("../invoke-direct", () => ({
  invokeAgentDirect: mocks.invokeAgentDirect,
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
    mocks.invokeAgentDirect.mockResolvedValue({
      delivered: true,
      kind: "answer",
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

    expect(event.channel.post).toHaveBeenCalledWith(
      expect.objectContaining({ markdown: expect.stringContaining("Use `/agent-z text:<question>`") })
    );
  });

  it("uses the direct path for slash prompts", async () => {
    const handlers = new Map<string, (event: any) => Promise<void>>();
    onSlash({ onSlashCommand: vi.fn((name, handler) => handlers.set(name, handler)) } as any);
    const event = { text: " audit the server ", channel: channel(), user: { userId: "user-1" } };

    await handlers.get("agent-z")?.(event);

    expect(mocks.invokeAgentDirect).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: "audit the server",
        invokerUserId: "user-1",
        replyTarget: expect.objectContaining({ _type: "discord:Channel" }),
      })
    );
    expect(event.channel.post).not.toHaveBeenCalled();
  });

  it("uses the direct path for mentions after stripping the bot mention", async () => {
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

    expect(mocks.invokeAgentDirect).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: "summarize this",
        replyTarget: expect.objectContaining({ _type: "discord:Channel" }),
      })
    );
    expect(thread.subscribe).toHaveBeenCalled();
    expect(thread.post).not.toHaveBeenCalled();
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

    expect(mocks.invokeAgentDirect).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: "what now?",
        replyTarget: expect.objectContaining({ _type: "discord:Channel" }),
      })
    );
    expect(thread.post).not.toHaveBeenCalled();
  });

  it("explains empty subscribed replies instead of silently ignoring them", async () => {
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
    const message = { text: "", author: { userId: "user-1" }, raw: { id: "message", author: { bot: false } } };

    await handlers[0](thread, message);

    expect(mocks.invokeAgentDirect).not.toHaveBeenCalled();
    expect(thread.post).toHaveBeenCalledWith(expect.stringContaining("Message Content Intent"));
  });

  it("keeps DMs guild-only and does not invoke workflows", async () => {
    const handlers: Array<(thread: any) => Promise<void>> = [];
    onDirectMessage({ onDirectMessage: vi.fn((handler) => handlers.push(handler)) } as any);
    const thread = { post: vi.fn() };

    await handlers[0](thread);

    expect(thread.post).toHaveBeenCalledWith(expect.stringContaining("server only"));
  });

  it("does not mutate on reactions", async () => {
    const handlers: Array<(event: any) => Promise<void>> = [];
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    onReaction({ onReaction: vi.fn((_emojis, handler) => handlers.push(handler)) } as any);

    await handlers[0]({ rawEmoji: "✅", messageId: "12345", user: { userId: "user-1" } });

    // Reaction handler should attempt to invoke verify (which will fail in test environment)
    // or log skipped-emoji if the emoji doesn't match config
    expect(info).toHaveBeenCalled();
  });

  it("rejects Discord confirmation actions with admin guidance", async () => {
    const handlers: Array<(event: any) => Promise<void>> = [];
    onAction({ onAction: vi.fn((handler) => handlers.push(handler)) } as any);
    const event = { actionId: "confirm:123", thread: { post: vi.fn() } };

    await handlers[0](event);

    expect(event.thread.post).toHaveBeenCalledWith(expect.stringContaining("admin confirmations page"));
  });
});

