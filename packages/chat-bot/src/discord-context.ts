import type { Message, SlashCommandEvent, Thread } from "chat";
import type { DiscordInvocationContext } from "@repo/agent/types";

export function getSlashDiscordContext(event: SlashCommandEvent): DiscordInvocationContext {
  const raw = asRecord(event.raw);
  const member = asRecord(raw?.member);
  const channel = event.channel.toJSON();
  return {
    guildId: stringValue(raw?.guild_id) || guildIdFromSerializedId(channel.id),
    channelId: stringValue(raw?.channel_id) || channelIdFromSerializedId(channel.id),
    roleIds: stringArray(member?.roles),
    isDirectMessage: channel.isDM,
  };
}

export function getMentionDiscordContext(thread: Thread, message: Message): DiscordInvocationContext {
  const raw = asRecord(message.raw);
  const member = asRecord(raw?.member);
  const serializedThread = thread.toJSON();
  return {
    guildId: stringValue(raw?.guild_id) || guildIdFromSerializedId(serializedThread.channelId),
    channelId: stringValue(raw?.channel_id) || channelIdFromSerializedId(serializedThread.channelId),
    roleIds: stringArray(member?.roles),
    isDirectMessage: serializedThread.isDM,
  };
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => item.trim());
}

function guildIdFromSerializedId(value: string): string {
  const parts = value.split(":");
  return parts[0] === "discord" ? parts[1] ?? "" : "";
}

function channelIdFromSerializedId(value: string): string {
  const parts = value.split(":");
  return parts[0] === "discord" ? parts[2] ?? "" : value;
}
