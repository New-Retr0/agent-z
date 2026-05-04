import { describe, expect, it } from "vitest";
import {
  parseAgentTier,
  parseDiscordContext,
  parsePrompt,
  parseReplyTarget,
  parseSystemPrompt,
  timingSafeSecretEqual,
} from "./workflow-request";

describe("workflow request parsing", () => {
  it("compares secrets without accepting empty values", () => {
    expect(timingSafeSecretEqual("secret", "secret")).toBe(true);
    expect(timingSafeSecretEqual("secret", "different")).toBe(false);
    expect(timingSafeSecretEqual("", "secret")).toBe(false);
    expect(timingSafeSecretEqual("secret", undefined)).toBe(false);
  });

  it("validates prompts and system prompts", () => {
    expect(parsePrompt("  hello  ")).toBe("hello");
    expect(parsePrompt("")).toBeNull();
    expect(parsePrompt("x".repeat(8_001))).toBeNull();

    expect(parseSystemPrompt("  custom system  ")).toBe("custom system");
    expect(parseSystemPrompt("")).toBeUndefined();
    expect(parseSystemPrompt("x".repeat(12_001))).toBeUndefined();
  });

  it("parses tiers with a fallback only when omitted", () => {
    expect(parseAgentTier(undefined, "admin")).toBe("admin");
    expect(parseAgentTier("", "mod")).toBe("mod");
    expect(parseAgentTier("verified", "admin")).toBe("verified");
    expect(parseAgentTier("owner", "admin")).toBeNull();
  });

  it("keeps only valid Discord context fields", () => {
    expect(
      parseDiscordContext({
        guildId: " guild ",
        channelId: " channel ",
        roleIds: [" admin ", "", 42, "mod"],
        isDirectMessage: true,
      })
    ).toEqual({
      guildId: "guild",
      channelId: "channel",
      roleIds: ["admin", "mod"],
      isDirectMessage: true,
      invokerUserId: undefined,
      invokerUsername: undefined,
      invokerGlobalName: undefined,
    });
    expect(parseDiscordContext(null)).toBeUndefined();
  });

  it("accepts only serializable channel or thread reply targets", () => {
    expect(
      parseReplyTarget({
        _type: "chat:Channel",
        adapterName: "discord",
        id: "discord:guild:channel",
        isDM: false,
      })
    ).toEqual({
      _type: "chat:Channel",
      adapterName: "discord",
      id: "discord:guild:channel",
      isDM: false,
      channelVisibility: undefined,
    });

    expect(
      parseReplyTarget({
        _type: "chat:Thread",
        adapterName: "discord",
        id: "thread",
        channelId: "discord:guild:channel",
        isDM: false,
        currentMessage: { id: "message" },
      })
    ).toMatchObject({
      _type: "chat:Thread",
      adapterName: "discord",
      id: "thread",
      channelId: "discord:guild:channel",
      isDM: false,
      currentMessage: { id: "message" },
    });

    expect(parseReplyTarget({ _type: "chat:Thread", adapterName: "discord", id: "thread", isDM: false })).toBeUndefined();
    expect(parseReplyTarget({ _type: "chat:Channel", adapterName: "discord", id: "channel" })).toBeUndefined();
  });

  it("accepts Discord interaction reply targets", () => {
    expect(
      parseReplyTarget({
        _type: "discord:Interaction",
        applicationId: "1495910562360594452",
        interactionToken: "token",
      })
    ).toEqual({
      _type: "discord:Interaction",
      applicationId: "1495910562360594452",
      interactionToken: "token",
    });
    expect(parseReplyTarget({ _type: "discord:Interaction", applicationId: "1495910562360594452" })).toBeUndefined();
  });

  it("accepts Discord channel reply targets", () => {
    expect(
      parseReplyTarget({
        _type: "discord:Channel",
        channelId: "300000000000000000",
        messageId: "400000000000000000",
      })
    ).toEqual({
      _type: "discord:Channel",
      channelId: "300000000000000000",
      messageId: "400000000000000000",
    });
    expect(parseReplyTarget({ _type: "discord:Channel", messageId: "400000000000000000" })).toBeUndefined();
  });
});

