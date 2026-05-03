import type { DiscordToolConfig } from "./config.js";
import { discordRequest, formatDiscordResponse } from "./discordRest.js";
import type { QueryRecord } from "./discordRest.js";
import {
  assertNotDeletingVerifiedRole,
  assertNotTargetingProtectedUser,
} from "./guards.js";
import { assertGuildAllowed } from "./guildAllowlist.js";

const SNOWFLAKE_RE = /^\d{17,20}$/;
const CHANNEL_PATH_RE = /\/channels\/(\d{17,20})/g;

export type DiscordCapabilityContext = {
  capabilityId: string;
  tier?: string;
  invokerUserId?: string;
  expectedGuildId?: string;
};

export type DiscordApiReadInput = {
  path: string;
  query?: QueryRecord;
  reason?: string;
};

export type DiscordSendMessageInput = {
  channelId: string;
  content: string;
  replyToMessageId?: string;
};

export type DiscordTimeoutMemberInput = {
  guildId: string;
  userId: string;
  communicationDisabledUntil: string | null;
  reason?: string;
};

export type DiscordMemberRoleInput = {
  guildId: string;
  userId: string;
  roleId: string;
  reason?: string;
};

export async function executeDiscordApiRead(
  config: DiscordToolConfig,
  input: DiscordApiReadInput,
  context: DiscordCapabilityContext
): Promise<string> {
  const path = normalizeApiPath(input.path);
  const allowedGuildIds = effectiveAllowedGuildIds(config.allowedGuildIds, context.expectedGuildId);

  assertGuildAllowed(path, allowedGuildIds);
  await assertChannelPathsAllowed(config, path, allowedGuildIds, context);

  const result = await discordRequest(config, {
    method: "GET",
    path,
    query: input.query,
    auditReason: buildAuditReason(context, `GET ${path}`, input.reason),
  });

  return formatDiscordResponse(result).slice(0, 12_000);
}

export async function executeDiscordSendMessage(
  config: DiscordToolConfig,
  input: DiscordSendMessageInput,
  context: DiscordCapabilityContext
): Promise<string> {
  assertSnowflake("channelId", input.channelId);
  const allowedGuildIds = effectiveAllowedGuildIds(config.allowedGuildIds, context.expectedGuildId);
  await assertChannelIdAllowed(config, input.channelId, allowedGuildIds, context);

  const result = await discordRequest(config, {
    method: "POST",
    path: `/channels/${input.channelId}/messages`,
    body: {
      content: input.content.slice(0, 2_000),
      allowed_mentions: { parse: [] },
      ...(input.replyToMessageId
        ? { message_reference: { message_id: input.replyToMessageId } }
        : {}),
    },
    auditReason: buildAuditReason(context, `POST /channels/${input.channelId}/messages`),
  });

  return formatDiscordResponse(result).slice(0, 12_000);
}

export async function executeDiscordTimeoutMember(
  config: DiscordToolConfig,
  input: DiscordTimeoutMemberInput,
  context: DiscordCapabilityContext
): Promise<string> {
  assertSnowflake("guildId", input.guildId);
  assertSnowflake("userId", input.userId);
  const path = `/guilds/${input.guildId}/members/${input.userId}`;
  const allowedGuildIds = effectiveAllowedGuildIds(config.allowedGuildIds, context.expectedGuildId);
  assertGuildAllowed(path, allowedGuildIds);
  assertExpectedGuild(input.guildId, context.expectedGuildId);
  assertNotTargetingProtectedUser(config.protectedOwnerUserId, "PATCH", path, {
    communication_disabled_until: input.communicationDisabledUntil,
  });

  const result = await discordRequest(config, {
    method: "PATCH",
    path,
    body: { communication_disabled_until: input.communicationDisabledUntil },
    auditReason: buildAuditReason(context, `PATCH ${path}`, input.reason),
  });

  return formatDiscordResponse(result).slice(0, 12_000);
}

export async function executeDiscordMemberRoleUpdate(
  config: DiscordToolConfig,
  input: DiscordMemberRoleInput,
  context: DiscordCapabilityContext,
  action: "assign" | "remove"
): Promise<string> {
  assertSnowflake("guildId", input.guildId);
  assertSnowflake("userId", input.userId);
  assertSnowflake("roleId", input.roleId);
  const method = action === "assign" ? "PUT" : "DELETE";
  const path = `/guilds/${input.guildId}/members/${input.userId}/roles/${input.roleId}`;
  const allowedGuildIds = effectiveAllowedGuildIds(config.allowedGuildIds, context.expectedGuildId);

  assertGuildAllowed(path, allowedGuildIds);
  assertExpectedGuild(input.guildId, context.expectedGuildId);
  assertNotDeletingVerifiedRole(method, path, config.reactionVerifiedRoleId, config.mcpAllowDeleteVerifiedRole);
  assertNotTargetingProtectedUser(config.protectedOwnerUserId, method, path, undefined);

  const result = await discordRequest(config, {
    method,
    path,
    auditReason: buildAuditReason(context, `${method} ${path}`, input.reason),
  });

  return formatDiscordResponse(result).slice(0, 12_000);
}

function normalizeApiPath(path: string): string {
  const trimmed = path.trim();
  if (!trimmed.startsWith("/")) {
    throw new Error(`path must start with /, got: ${path}`);
  }
  if (/^https?:\/\//i.test(trimmed)) {
    throw new Error("Use a Discord API path, not a full URL.");
  }
  return trimmed;
}

function effectiveAllowedGuildIds(envAllowed: Set<string> | null, expectedGuildId?: string): Set<string> | null {
  if (envAllowed?.size) {
    return envAllowed;
  }
  return expectedGuildId ? new Set([expectedGuildId]) : null;
}

async function assertChannelPathsAllowed(
  config: DiscordToolConfig,
  path: string,
  allowedGuildIds: Set<string> | null,
  context: DiscordCapabilityContext
) {
  const channelIds = extractChannelIdsFromPath(path);
  for (const channelId of channelIds) {
    await assertChannelIdAllowed(config, channelId, allowedGuildIds, context);
  }
}

async function assertChannelIdAllowed(
  config: DiscordToolConfig,
  channelId: string,
  allowedGuildIds: Set<string> | null,
  context: DiscordCapabilityContext
) {
  assertSnowflake("channelId", channelId);
  if (!allowedGuildIds?.size && !context.expectedGuildId) {
    return;
  }

  const channel = await discordRequest(config, {
    method: "GET",
    path: `/channels/${channelId}`,
    auditReason: buildAuditReason(context, `GET /channels/${channelId}`),
  });
  if (channel.status < 200 || channel.status >= 300) {
    throw new Error(`Could not verify channel ${channelId} before using it: Discord returned ${channel.status}.`);
  }
  const guildId = recordProp(channel.body, "guild_id");
  if (!guildId) {
    throw new Error(`Channel ${channelId} is not a guild channel or did not include guild_id.`);
  }
  assertExpectedGuild(guildId, context.expectedGuildId);
  if (allowedGuildIds?.size && !allowedGuildIds.has(guildId)) {
    throw new Error(`Channel ${channelId} belongs to guild ${guildId}, which is not allowed.`);
  }
}

function extractChannelIdsFromPath(path: string): string[] {
  const ids = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = CHANNEL_PATH_RE.exec(path)) !== null) {
    ids.add(match[1]);
  }
  return [...ids];
}

function assertExpectedGuild(actualGuildId: string, expectedGuildId?: string) {
  if (expectedGuildId && actualGuildId !== expectedGuildId) {
    throw new Error(`Guild ${actualGuildId} does not match this invocation guild ${expectedGuildId}.`);
  }
}

function assertSnowflake(name: string, value: string) {
  if (!SNOWFLAKE_RE.test(value)) {
    throw new Error(`${name} must be a Discord snowflake.`);
  }
}

function buildAuditReason(context: DiscordCapabilityContext, action: string, reason?: string) {
  const suffix = reason?.trim() || action;
  return `agent-z: ${context.invokerUserId ?? "unknown"} ${context.capabilityId} ${context.tier ?? "unknown"} - ${suffix}`.slice(0, 480);
}

function recordProp(value: unknown, key: string): string | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const prop = (value as Record<string, unknown>)[key];
  return typeof prop === "string" && prop.trim() ? prop.trim() : undefined;
}
