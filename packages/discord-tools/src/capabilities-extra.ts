import type { DiscordToolConfig } from "./config.js";
import {
  assertChannelIdAllowed,
  assertExpectedGuild,
  assertSnowflake,
  buildAuditReason,
  effectiveAllowedGuildIds,
  type DiscordCapabilityContext,
} from "./capabilities.js";
import { discordRequest, formatDiscordResponse } from "./discordRest.js";
import type { QueryRecord } from "./discordRest.js";
import { assertGuildAllowed } from "./guildAllowlist.js";
import { assertNotDeletingVerifiedRole, assertNotTargetingProtectedUser } from "./guards.js";

function memberPath(guildId: string, userId: string) {
  return `/guilds/${guildId}/members/${userId}`;
}

function guildPrep(
  config: DiscordToolConfig,
  guildId: string,
  context: DiscordCapabilityContext
) {
  assertSnowflake("guildId", guildId);
  const allowed = effectiveAllowedGuildIds(config.allowedGuildIds, context.expectedGuildId);
  assertGuildAllowed(`/guilds/${guildId}/x`, allowed);
  assertExpectedGuild(guildId, context.expectedGuildId);
  return allowed;
}

export async function executeDiscordKickMember(
  config: DiscordToolConfig,
  input: { guildId: string; userId: string; reason?: string },
  context: DiscordCapabilityContext
): Promise<string> {
  guildPrep(config, input.guildId, context);
  assertSnowflake("userId", input.userId);
  const path = memberPath(input.guildId, input.userId);
  assertNotTargetingProtectedUser(config.protectedOwnerUserId, "DELETE", path, undefined);
  const result = await discordRequest(config, {
    method: "DELETE",
    path,
    auditReason: buildAuditReason(context, `DELETE ${path}`, input.reason),
  });
  return formatDiscordResponse(result).slice(0, 12_000);
}

export async function executeDiscordBanMember(
  config: DiscordToolConfig,
  input: { guildId: string; userId: string; deleteMessageSeconds?: number | null; reason?: string },
  context: DiscordCapabilityContext
): Promise<string> {
  guildPrep(config, input.guildId, context);
  assertSnowflake("userId", input.userId);
  const path = `/guilds/${input.guildId}/bans/${input.userId}`;
  assertNotTargetingProtectedUser(config.protectedOwnerUserId, "PUT", path, undefined);
  const body: Record<string, unknown> = {};
  if (input.deleteMessageSeconds != null) body.delete_message_seconds = input.deleteMessageSeconds;
  const result = await discordRequest(config, {
    method: "PUT",
    path,
    body: Object.keys(body).length ? body : {},
    auditReason: buildAuditReason(context, `PUT ${path}`, input.reason),
  });
  return formatDiscordResponse(result).slice(0, 12_000);
}

export async function executeDiscordUnbanMember(
  config: DiscordToolConfig,
  input: { guildId: string; userId: string; reason?: string },
  context: DiscordCapabilityContext
): Promise<string> {
  guildPrep(config, input.guildId, context);
  assertSnowflake("userId", input.userId);
  const path = `/guilds/${input.guildId}/bans/${input.userId}`;
  assertNotTargetingProtectedUser(config.protectedOwnerUserId, "DELETE", path, undefined);
  const result = await discordRequest(config, {
    method: "DELETE",
    path,
    auditReason: buildAuditReason(context, `DELETE ${path}`, input.reason),
  });
  return formatDiscordResponse(result).slice(0, 12_000);
}

export async function executeDiscordSetMemberNickname(
  config: DiscordToolConfig,
  input: { guildId: string; userId: string; nick: string | null; reason?: string },
  context: DiscordCapabilityContext
): Promise<string> {
  guildPrep(config, input.guildId, context);
  assertSnowflake("userId", input.userId);
  const path = memberPath(input.guildId, input.userId);
  assertNotTargetingProtectedUser(config.protectedOwnerUserId, "PATCH", path, { nick: input.nick });
  const result = await discordRequest(config, {
    method: "PATCH",
    path,
    body: { nick: input.nick },
    auditReason: buildAuditReason(context, `PATCH nick ${path}`, input.reason),
  });
  return formatDiscordResponse(result).slice(0, 12_000);
}

export async function executeDiscordMoveMemberVoice(
  config: DiscordToolConfig,
  input: { guildId: string; userId: string; channelId: string | null; reason?: string },
  context: DiscordCapabilityContext
): Promise<string> {
  guildPrep(config, input.guildId, context);
  assertSnowflake("userId", input.userId);
  if (input.channelId) assertSnowflake("channelId", input.channelId);
  const path = memberPath(input.guildId, input.userId);
  assertNotTargetingProtectedUser(config.protectedOwnerUserId, "PATCH", path, { channel_id: input.channelId });
  const result = await discordRequest(config, {
    method: "PATCH",
    path,
    body: { channel_id: input.channelId },
    auditReason: buildAuditReason(context, `PATCH voice ${path}`, input.reason),
  });
  return formatDiscordResponse(result).slice(0, 12_000);
}

export async function executeDiscordFetchMember(
  config: DiscordToolConfig,
  input: { guildId: string; userId: string; reason?: string },
  context: DiscordCapabilityContext
): Promise<string> {
  guildPrep(config, input.guildId, context);
  assertSnowflake("userId", input.userId);
  const path = memberPath(input.guildId, input.userId);
  const result = await discordRequest(config, {
    method: "GET",
    path,
    auditReason: buildAuditReason(context, `GET ${path}`, input.reason),
  });
  return formatDiscordResponse(result).slice(0, 12_000);
}

export async function executeDiscordCreateChannel(
  config: DiscordToolConfig,
  input: { guildId: string; body: Record<string, unknown>; reason?: string },
  context: DiscordCapabilityContext
): Promise<string> {
  guildPrep(config, input.guildId, context);
  const result = await discordRequest(config, {
    method: "POST",
    path: `/guilds/${input.guildId}/channels`,
    body: input.body,
    auditReason: buildAuditReason(context, "POST /guilds/.../channels", input.reason),
  });
  return formatDiscordResponse(result).slice(0, 12_000);
}

export async function executeDiscordEditChannel(
  config: DiscordToolConfig,
  input: { channelId: string; body: Record<string, unknown>; reason?: string },
  context: DiscordCapabilityContext
): Promise<string> {
  assertSnowflake("channelId", input.channelId);
  const allowed = effectiveAllowedGuildIds(config.allowedGuildIds, context.expectedGuildId);
  await assertChannelIdAllowed(config, input.channelId, allowed, context);
  const result = await discordRequest(config, {
    method: "PATCH",
    path: `/channels/${input.channelId}`,
    body: input.body,
    auditReason: buildAuditReason(context, `PATCH /channels/${input.channelId}`, input.reason),
  });
  return formatDiscordResponse(result).slice(0, 12_000);
}

export async function executeDiscordDeleteChannel(
  config: DiscordToolConfig,
  input: { channelId: string; reason?: string },
  context: DiscordCapabilityContext
): Promise<string> {
  assertSnowflake("channelId", input.channelId);
  const allowed = effectiveAllowedGuildIds(config.allowedGuildIds, context.expectedGuildId);
  await assertChannelIdAllowed(config, input.channelId, allowed, context);
  const result = await discordRequest(config, {
    method: "DELETE",
    path: `/channels/${input.channelId}`,
    auditReason: buildAuditReason(context, `DELETE /channels/${input.channelId}`, input.reason),
  });
  return formatDiscordResponse(result).slice(0, 12_000);
}

export async function executeDiscordCreateInvite(
  config: DiscordToolConfig,
  input: { channelId: string; body?: Record<string, unknown>; reason?: string },
  context: DiscordCapabilityContext
): Promise<string> {
  assertSnowflake("channelId", input.channelId);
  const allowed = effectiveAllowedGuildIds(config.allowedGuildIds, context.expectedGuildId);
  await assertChannelIdAllowed(config, input.channelId, allowed, context);
  const result = await discordRequest(config, {
    method: "POST",
    path: `/channels/${input.channelId}/invites`,
    body: input.body ?? {},
    auditReason: buildAuditReason(context, "POST invites", input.reason),
  });
  return formatDiscordResponse(result).slice(0, 12_000);
}

export async function executeDiscordPinMessage(
  config: DiscordToolConfig,
  input: { channelId: string; messageId: string; reason?: string },
  context: DiscordCapabilityContext
): Promise<string> {
  assertSnowflake("channelId", input.channelId);
  assertSnowflake("messageId", input.messageId);
  const allowed = effectiveAllowedGuildIds(config.allowedGuildIds, context.expectedGuildId);
  await assertChannelIdAllowed(config, input.channelId, allowed, context);
  const path = `/channels/${input.channelId}/pins/${input.messageId}`;
  const result = await discordRequest(config, {
    method: "PUT",
    path,
    auditReason: buildAuditReason(context, path, input.reason),
  });
  return formatDiscordResponse(result).slice(0, 12_000);
}

export async function executeDiscordUnpinMessage(
  config: DiscordToolConfig,
  input: { channelId: string; messageId: string; reason?: string },
  context: DiscordCapabilityContext
): Promise<string> {
  assertSnowflake("channelId", input.channelId);
  assertSnowflake("messageId", input.messageId);
  const allowed = effectiveAllowedGuildIds(config.allowedGuildIds, context.expectedGuildId);
  await assertChannelIdAllowed(config, input.channelId, allowed, context);
  const path = `/channels/${input.channelId}/pins/${input.messageId}`;
  const result = await discordRequest(config, {
    method: "DELETE",
    path,
    auditReason: buildAuditReason(context, path, input.reason),
  });
  return formatDiscordResponse(result).slice(0, 12_000);
}

export async function executeDiscordCreateRole(
  config: DiscordToolConfig,
  input: { guildId: string; body?: Record<string, unknown>; reason?: string },
  context: DiscordCapabilityContext
): Promise<string> {
  guildPrep(config, input.guildId, context);
  const result = await discordRequest(config, {
    method: "POST",
    path: `/guilds/${input.guildId}/roles`,
    body: input.body ?? {},
    auditReason: buildAuditReason(context, "POST roles", input.reason),
  });
  return formatDiscordResponse(result).slice(0, 12_000);
}

export async function executeDiscordEditRole(
  config: DiscordToolConfig,
  input: { guildId: string; roleId: string; body: Record<string, unknown>; reason?: string },
  context: DiscordCapabilityContext
): Promise<string> {
  guildPrep(config, input.guildId, context);
  assertSnowflake("roleId", input.roleId);
  const path = `/guilds/${input.guildId}/roles/${input.roleId}`;
  assertNotDeletingVerifiedRole("PATCH", path, config.reactionVerifiedRoleId, config.mcpAllowDeleteVerifiedRole);
  const result = await discordRequest(config, {
    method: "PATCH",
    path,
    body: input.body,
    auditReason: buildAuditReason(context, path, input.reason),
  });
  return formatDiscordResponse(result).slice(0, 12_000);
}

export async function executeDiscordDeleteRole(
  config: DiscordToolConfig,
  input: { guildId: string; roleId: string; reason?: string },
  context: DiscordCapabilityContext
): Promise<string> {
  guildPrep(config, input.guildId, context);
  assertSnowflake("roleId", input.roleId);
  const path = `/guilds/${input.guildId}/roles/${input.roleId}`;
  assertNotDeletingVerifiedRole("DELETE", path, config.reactionVerifiedRoleId, config.mcpAllowDeleteVerifiedRole);
  const result = await discordRequest(config, {
    method: "DELETE",
    path,
    auditReason: buildAuditReason(context, path, input.reason),
  });
  return formatDiscordResponse(result).slice(0, 12_000);
}

export async function executeDiscordReorderRoles(
  config: DiscordToolConfig,
  input: { guildId: string; rolePositions: Array<{ id: string; position: number }>; reason?: string },
  context: DiscordCapabilityContext
): Promise<string> {
  guildPrep(config, input.guildId, context);
  const result = await discordRequest(config, {
    method: "PATCH",
    path: `/guilds/${input.guildId}/roles`,
    body: input.rolePositions.map((r) => ({ id: r.id, position: r.position })),
    auditReason: buildAuditReason(context, "PATCH role order", input.reason),
  });
  return formatDiscordResponse(result).slice(0, 12_000);
}

export async function executeDiscordCreateThreadFromMessage(
  config: DiscordToolConfig,
  input: { channelId: string; messageId: string; body: Record<string, unknown>; reason?: string },
  context: DiscordCapabilityContext
): Promise<string> {
  assertSnowflake("channelId", input.channelId);
  assertSnowflake("messageId", input.messageId);
  const allowed = effectiveAllowedGuildIds(config.allowedGuildIds, context.expectedGuildId);
  await assertChannelIdAllowed(config, input.channelId, allowed, context);
  const path = `/channels/${input.channelId}/messages/${input.messageId}/threads`;
  const result = await discordRequest(config, {
    method: "POST",
    path,
    body: input.body,
    auditReason: buildAuditReason(context, path, input.reason),
  });
  return formatDiscordResponse(result).slice(0, 12_000);
}

export async function executeDiscordCreateThread(
  config: DiscordToolConfig,
  input: { channelId: string; body: Record<string, unknown>; reason?: string },
  context: DiscordCapabilityContext
): Promise<string> {
  assertSnowflake("channelId", input.channelId);
  const allowed = effectiveAllowedGuildIds(config.allowedGuildIds, context.expectedGuildId);
  await assertChannelIdAllowed(config, input.channelId, allowed, context);
  const result = await discordRequest(config, {
    method: "POST",
    path: `/channels/${input.channelId}/threads`,
    body: input.body,
    auditReason: buildAuditReason(context, "POST thread", input.reason),
  });
  return formatDiscordResponse(result).slice(0, 12_000);
}

export async function executeDiscordEditThreadMetadata(
  config: DiscordToolConfig,
  input: { channelId: string; body: Record<string, unknown>; reason?: string },
  context: DiscordCapabilityContext
): Promise<string> {
  assertSnowflake("channelId", input.channelId);
  const allowed = effectiveAllowedGuildIds(config.allowedGuildIds, context.expectedGuildId);
  await assertChannelIdAllowed(config, input.channelId, allowed, context);
  const result = await discordRequest(config, {
    method: "PATCH",
    path: `/channels/${input.channelId}/thread-metadata`,
    body: input.body,
    auditReason: buildAuditReason(context, "PATCH thread-metadata", input.reason),
  });
  return formatDiscordResponse(result).slice(0, 12_000);
}

export async function executeDiscordAddThreadMember(
  config: DiscordToolConfig,
  input: { threadId: string; userId: string; reason?: string },
  context: DiscordCapabilityContext
): Promise<string> {
  assertSnowflake("threadId", input.threadId);
  assertSnowflake("userId", input.userId);
  const allowed = effectiveAllowedGuildIds(config.allowedGuildIds, context.expectedGuildId);
  await assertChannelIdAllowed(config, input.threadId, allowed, context);
  const path = `/channels/${input.threadId}/thread-members/${input.userId}`;
  const result = await discordRequest(config, {
    method: "PUT",
    path,
    body: {},
    auditReason: buildAuditReason(context, path, input.reason),
  });
  return formatDiscordResponse(result).slice(0, 12_000);
}

export async function executeDiscordRemoveThreadMember(
  config: DiscordToolConfig,
  input: { threadId: string; userId: string; reason?: string },
  context: DiscordCapabilityContext
): Promise<string> {
  assertSnowflake("threadId", input.threadId);
  assertSnowflake("userId", input.userId);
  const allowed = effectiveAllowedGuildIds(config.allowedGuildIds, context.expectedGuildId);
  await assertChannelIdAllowed(config, input.threadId, allowed, context);
  const path = `/channels/${input.threadId}/thread-members/${input.userId}`;
  const result = await discordRequest(config, {
    method: "DELETE",
    path,
    auditReason: buildAuditReason(context, path, input.reason),
  });
  return formatDiscordResponse(result).slice(0, 12_000);
}

export async function executeDiscordEditMessage(
  config: DiscordToolConfig,
  input: { channelId: string; messageId: string; body: Record<string, unknown>; reason?: string },
  context: DiscordCapabilityContext
): Promise<string> {
  assertSnowflake("channelId", input.channelId);
  assertSnowflake("messageId", input.messageId);
  const allowed = effectiveAllowedGuildIds(config.allowedGuildIds, context.expectedGuildId);
  await assertChannelIdAllowed(config, input.channelId, allowed, context);
  const path = `/channels/${input.channelId}/messages/${input.messageId}`;
  const result = await discordRequest(config, {
    method: "PATCH",
    path,
    body: input.body,
    auditReason: buildAuditReason(context, path, input.reason),
  });
  return formatDiscordResponse(result).slice(0, 12_000);
}

export async function executeDiscordDeleteMessage(
  config: DiscordToolConfig,
  input: { channelId: string; messageId: string; reason?: string },
  context: DiscordCapabilityContext
): Promise<string> {
  assertSnowflake("channelId", input.channelId);
  assertSnowflake("messageId", input.messageId);
  const allowed = effectiveAllowedGuildIds(config.allowedGuildIds, context.expectedGuildId);
  await assertChannelIdAllowed(config, input.channelId, allowed, context);
  const path = `/channels/${input.channelId}/messages/${input.messageId}`;
  const result = await discordRequest(config, {
    method: "DELETE",
    path,
    auditReason: buildAuditReason(context, path, input.reason),
  });
  return formatDiscordResponse(result).slice(0, 12_000);
}

export async function executeDiscordCrosspostMessage(
  config: DiscordToolConfig,
  input: { channelId: string; messageId: string; reason?: string },
  context: DiscordCapabilityContext
): Promise<string> {
  assertSnowflake("channelId", input.channelId);
  assertSnowflake("messageId", input.messageId);
  const allowed = effectiveAllowedGuildIds(config.allowedGuildIds, context.expectedGuildId);
  await assertChannelIdAllowed(config, input.channelId, allowed, context);
  const path = `/channels/${input.channelId}/messages/${input.messageId}/crosspost`;
  const result = await discordRequest(config, {
    method: "POST",
    path,
    body: {},
    auditReason: buildAuditReason(context, path, input.reason),
  });
  return formatDiscordResponse(result).slice(0, 12_000);
}

function encodeReactionEmoji(emoji: string): string {
  const t = emoji.trim();
  if (t.includes(":") && t.includes(">")) {
    const m = t.match(/^<a?:([^:>]+):(\d{17,20})>$/);
    if (m) return encodeURIComponent(`${m[1]}:${m[2]}`);
  }
  if (/^[a-zA-Z0-9_]+:\d{17,20}$/.test(t)) return encodeURIComponent(t);
  return encodeURIComponent(t);
}

export async function executeDiscordAddReaction(
  config: DiscordToolConfig,
  input: { channelId: string; messageId: string; emoji: string; reason?: string },
  context: DiscordCapabilityContext
): Promise<string> {
  assertSnowflake("channelId", input.channelId);
  assertSnowflake("messageId", input.messageId);
  const allowed = effectiveAllowedGuildIds(config.allowedGuildIds, context.expectedGuildId);
  await assertChannelIdAllowed(config, input.channelId, allowed, context);
  const e = encodeReactionEmoji(input.emoji);
  const path = `/channels/${input.channelId}/messages/${input.messageId}/reactions/${e}/@me`;
  const result = await discordRequest(config, {
    method: "PUT",
    path,
    body: {},
    auditReason: buildAuditReason(context, path, input.reason),
  });
  return formatDiscordResponse(result).slice(0, 12_000);
}

export async function executeDiscordRemoveReaction(
  config: DiscordToolConfig,
  input: { channelId: string; messageId: string; emoji: string; userId?: string; reason?: string },
  context: DiscordCapabilityContext
): Promise<string> {
  assertSnowflake("channelId", input.channelId);
  assertSnowflake("messageId", input.messageId);
  const allowed = effectiveAllowedGuildIds(config.allowedGuildIds, context.expectedGuildId);
  await assertChannelIdAllowed(config, input.channelId, allowed, context);
  const e = encodeReactionEmoji(input.emoji);
  const who = input.userId && input.userId !== "@me" ? input.userId : "@me";
  const path = `/channels/${input.channelId}/messages/${input.messageId}/reactions/${e}/${who}`;
  const result = await discordRequest(config, {
    method: "DELETE",
    path,
    auditReason: buildAuditReason(context, path, input.reason),
  });
  return formatDiscordResponse(result).slice(0, 12_000);
}

export async function executeDiscordCreateScheduledEvent(
  config: DiscordToolConfig,
  input: { guildId: string; body: Record<string, unknown>; reason?: string },
  context: DiscordCapabilityContext
): Promise<string> {
  guildPrep(config, input.guildId, context);
  const result = await discordRequest(config, {
    method: "POST",
    path: `/guilds/${input.guildId}/scheduled-events`,
    body: input.body,
    auditReason: buildAuditReason(context, "POST scheduled-events", input.reason),
  });
  return formatDiscordResponse(result).slice(0, 12_000);
}

export async function executeDiscordEditScheduledEvent(
  config: DiscordToolConfig,
  input: { guildId: string; eventId: string; body: Record<string, unknown>; reason?: string },
  context: DiscordCapabilityContext
): Promise<string> {
  guildPrep(config, input.guildId, context);
  assertSnowflake("eventId", input.eventId);
  const path = `/guilds/${input.guildId}/scheduled-events/${input.eventId}`;
  const result = await discordRequest(config, {
    method: "PATCH",
    path,
    body: input.body,
    auditReason: buildAuditReason(context, path, input.reason),
  });
  return formatDiscordResponse(result).slice(0, 12_000);
}

export async function executeDiscordDeleteScheduledEvent(
  config: DiscordToolConfig,
  input: { guildId: string; eventId: string; reason?: string },
  context: DiscordCapabilityContext
): Promise<string> {
  guildPrep(config, input.guildId, context);
  assertSnowflake("eventId", input.eventId);
  const path = `/guilds/${input.guildId}/scheduled-events/${input.eventId}`;
  const result = await discordRequest(config, {
    method: "DELETE",
    path,
    auditReason: buildAuditReason(context, path, input.reason),
  });
  return formatDiscordResponse(result).slice(0, 12_000);
}

export async function executeDiscordListAutoModRules(
  config: DiscordToolConfig,
  input: { guildId: string; reason?: string },
  context: DiscordCapabilityContext
): Promise<string> {
  guildPrep(config, input.guildId, context);
  const path = `/guilds/${input.guildId}/auto-moderation/rules`;
  const result = await discordRequest(config, {
    method: "GET",
    path,
    auditReason: buildAuditReason(context, path, input.reason),
  });
  return formatDiscordResponse(result).slice(0, 12_000);
}

export async function executeDiscordCreateAutoModRule(
  config: DiscordToolConfig,
  input: { guildId: string; body: Record<string, unknown>; reason?: string },
  context: DiscordCapabilityContext
): Promise<string> {
  guildPrep(config, input.guildId, context);
  const result = await discordRequest(config, {
    method: "POST",
    path: `/guilds/${input.guildId}/auto-moderation/rules`,
    body: input.body,
    auditReason: buildAuditReason(context, "POST automod rule", input.reason),
  });
  return formatDiscordResponse(result).slice(0, 12_000);
}

export async function executeDiscordEditAutoModRule(
  config: DiscordToolConfig,
  input: { guildId: string; ruleId: string; body: Record<string, unknown>; reason?: string },
  context: DiscordCapabilityContext
): Promise<string> {
  guildPrep(config, input.guildId, context);
  assertSnowflake("ruleId", input.ruleId);
  const path = `/guilds/${input.guildId}/auto-moderation/rules/${input.ruleId}`;
  const result = await discordRequest(config, {
    method: "PATCH",
    path,
    body: input.body,
    auditReason: buildAuditReason(context, path, input.reason),
  });
  return formatDiscordResponse(result).slice(0, 12_000);
}

export async function executeDiscordDeleteAutoModRule(
  config: DiscordToolConfig,
  input: { guildId: string; ruleId: string; reason?: string },
  context: DiscordCapabilityContext
): Promise<string> {
  guildPrep(config, input.guildId, context);
  assertSnowflake("ruleId", input.ruleId);
  const path = `/guilds/${input.guildId}/auto-moderation/rules/${input.ruleId}`;
  const result = await discordRequest(config, {
    method: "DELETE",
    path,
    auditReason: buildAuditReason(context, path, input.reason),
  });
  return formatDiscordResponse(result).slice(0, 12_000);
}

export async function executeDiscordListGuildEmojis(
  config: DiscordToolConfig,
  input: { guildId: string; reason?: string },
  context: DiscordCapabilityContext
): Promise<string> {
  guildPrep(config, input.guildId, context);
  const path = `/guilds/${input.guildId}/emojis`;
  const result = await discordRequest(config, {
    method: "GET",
    path,
    auditReason: buildAuditReason(context, path, input.reason),
  });
  return formatDiscordResponse(result).slice(0, 12_000);
}

/** `imageBase64` should be raw base64 (no data: prefix). Discord expects image/png, image/jpeg, or image/gif. */
export async function executeDiscordCreateGuildEmoji(
  config: DiscordToolConfig,
  input: { guildId: string; name: string; imageBase64: string; reason?: string },
  context: DiscordCapabilityContext
): Promise<string> {
  guildPrep(config, input.guildId, context);
  const buf = Buffer.from(input.imageBase64, "base64");
  const blob = new Blob([buf]);
  const fd = new FormData();
  fd.append("name", input.name.slice(0, 32));
  fd.append("image", blob, "emoji.png");
  const result = await discordRequest(config, {
    method: "POST",
    path: `/guilds/${input.guildId}/emojis`,
    formData: fd,
    auditReason: buildAuditReason(context, "POST emoji", input.reason),
  });
  return formatDiscordResponse(result).slice(0, 12_000);
}

export async function executeDiscordDeleteGuildEmoji(
  config: DiscordToolConfig,
  input: { guildId: string; emojiId: string; reason?: string },
  context: DiscordCapabilityContext
): Promise<string> {
  guildPrep(config, input.guildId, context);
  assertSnowflake("emojiId", input.emojiId);
  const path = `/guilds/${input.guildId}/emojis/${input.emojiId}`;
  const result = await discordRequest(config, {
    method: "DELETE",
    path,
    auditReason: buildAuditReason(context, path, input.reason),
  });
  return formatDiscordResponse(result).slice(0, 12_000);
}

export async function executeDiscordFetchAuditLog(
  config: DiscordToolConfig,
  input: { guildId: string; query?: QueryRecord; reason?: string },
  context: DiscordCapabilityContext
): Promise<string> {
  guildPrep(config, input.guildId, context);
  const result = await discordRequest(config, {
    method: "GET",
    path: `/guilds/${input.guildId}/audit-logs`,
    query: input.query,
    auditReason: buildAuditReason(context, "GET audit-logs", input.reason),
  });
  return formatDiscordResponse(result).slice(0, 12_000);
}

export async function executeDiscordListGuildWebhooks(
  config: DiscordToolConfig,
  input: { guildId: string; reason?: string },
  context: DiscordCapabilityContext
): Promise<string> {
  guildPrep(config, input.guildId, context);
  const path = `/guilds/${input.guildId}/webhooks`;
  const result = await discordRequest(config, {
    method: "GET",
    path,
    auditReason: buildAuditReason(context, path, input.reason),
  });
  return formatDiscordResponse(result).slice(0, 12_000);
}

export async function executeDiscordCreateWebhook(
  config: DiscordToolConfig,
  input: { channelId: string; body: Record<string, unknown>; reason?: string },
  context: DiscordCapabilityContext
): Promise<string> {
  assertSnowflake("channelId", input.channelId);
  const allowed = effectiveAllowedGuildIds(config.allowedGuildIds, context.expectedGuildId);
  await assertChannelIdAllowed(config, input.channelId, allowed, context);
  const result = await discordRequest(config, {
    method: "POST",
    path: `/channels/${input.channelId}/webhooks`,
    body: input.body,
    auditReason: buildAuditReason(context, "POST webhook", input.reason),
  });
  return formatDiscordResponse(result).slice(0, 12_000);
}

export async function executeDiscordDeleteWebhook(
  config: DiscordToolConfig,
  input: { webhookId: string; reason?: string; token?: string },
  context: DiscordCapabilityContext
): Promise<string> {
  assertSnowflake("webhookId", input.webhookId);
  const q: QueryRecord = {};
  if (input.token?.trim()) q.webhook_token = input.token.trim();
  const path = `/webhooks/${input.webhookId}`;
  void context.expectedGuildId;
  const result = await discordRequest(config, {
    method: "DELETE",
    path,
    query: Object.keys(q).length ? q : undefined,
    auditReason: buildAuditReason(context, "DELETE webhook", input.reason),
  });
  return formatDiscordResponse(result).slice(0, 12_000);
}

export async function executeDiscordBulkDeleteMessages(
  config: DiscordToolConfig,
  input: { channelId: string; messageIds: string[]; reason?: string },
  context: DiscordCapabilityContext
): Promise<string> {
  assertSnowflake("channelId", input.channelId);
  const allowed = effectiveAllowedGuildIds(config.allowedGuildIds, context.expectedGuildId);
  await assertChannelIdAllowed(config, input.channelId, allowed, context);
  if (input.messageIds.length < 2 || input.messageIds.length > 100) {
    throw new Error("bulk delete requires between 2 and 100 message ids.");
  }
  const result = await discordRequest(config, {
    method: "POST",
    path: `/channels/${input.channelId}/messages/bulk-delete`,
    body: { messages: input.messageIds },
    auditReason: buildAuditReason(context, "bulk-delete", input.reason),
  });
  return formatDiscordResponse(result).slice(0, 12_000);
}
