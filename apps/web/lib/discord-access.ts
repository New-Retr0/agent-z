import { getRuntimeConfig } from "@repo/config/runtime-config";
import { prisma } from "@repo/db";
import type { AgentTier, DiscordInvocationContext } from "@repo/agent/types";

const ROLE_PRIORITY = ["admin", "mod", "verified"] as const;
const AGENT_CHANNEL_KINDS = new Set(["agent", "agent_allowed", "allowed", "bot", "workflow", "agent-z"]);

export type DiscordAccessDecision =
  | { allowed: true; tier: AgentTier }
  | { allowed: false; reason: string };

export async function resolveDiscordAccess(
  context: DiscordInvocationContext | undefined
): Promise<DiscordAccessDecision> {
  if (!context) {
    return { allowed: false, reason: "Discord invocation context is required." };
  }
  if (context.isDirectMessage) {
    return { allowed: false, reason: "Agent Z runs in server channels, not DMs." };
  }

  const runtimeConfig = await getRuntimeConfig();
  const channelId = normalizeDiscordSnowflake(context.channelId);
  const roleIds = new Set(context.roleIds.map(normalizeDiscordSnowflake).filter(Boolean));
  let roleMappings: Array<{ kind: string; discordRoleId: string }> = [];
  let channelMappings: Array<{ kind: string; discordChannelId: string }> = [];
  try {
    [roleMappings, channelMappings] = await Promise.all([
      prisma.roleMapping.findMany({ where: { kind: { in: [...ROLE_PRIORITY] } } }),
      prisma.channelMapping.findMany(),
    ]);
  } catch {
    return { allowed: false, reason: "Discord access policy is unavailable." };
  }

  const allowedChannelIds = channelMappings
    .filter((mapping) => AGENT_CHANNEL_KINDS.has(mapping.kind))
    .map((mapping) => normalizeDiscordSnowflake(mapping.discordChannelId))
    .filter(Boolean);

  if (allowedChannelIds.length > 0 && (!channelId || !allowedChannelIds.includes(channelId))) {
    return { allowed: false, reason: "Agent Z is not enabled in this channel." };
  }

  for (const tier of ROLE_PRIORITY) {
    const mappedRoleIds = roleMappings
      .filter((mapping) => mapping.kind === tier)
      .map((mapping) => normalizeDiscordSnowflake(mapping.discordRoleId));
    if (mappedRoleIds.some((roleId) => roleIds.has(roleId))) {
      return { allowed: true, tier };
    }
  }

  if (runtimeConfig.publicTierEnabled) {
    return { allowed: true, tier: "public" };
  }

  return { allowed: false, reason: "You need a mapped Discord role to run Agent Z." };
}

function normalizeDiscordSnowflake(value: string | undefined): string {
  if (!value) {
    return "";
  }
  const trimmed = value.trim();
  if (/^\d{17,20}$/.test(trimmed)) {
    return trimmed;
  }
  const parts = trimmed.split(":");
  if (parts[0] === "discord") {
    return parts[2] ?? parts[1] ?? "";
  }
  return trimmed;
}
