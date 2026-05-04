import { z } from "zod";
import {
  executeDiscordApiRead,
  executeDiscordMemberRoleUpdate,
  executeDiscordSendMessage,
  executeDiscordTimeoutMember,
  loadDiscordToolConfig,
} from "@repo/discord-tools";
import type { DiscordApiReadInput } from "@repo/discord-tools";
import type { AgentTier, DiscordInvocationContext } from "./types.js";

export type TierToolContext = {
  tier: AgentTier;
  discordContext?: DiscordInvocationContext;
  invokerUserId?: string;
};

/**
 * Tier-scoped tool definitions for `DurableAgent` (description + inputSchema + execute).
 * Kept as plain objects to keep `tsc` fast (avoid heavy `ai` `tool()` generic instantiation).
 *
 * The production Discord path uses MCP tools from `runAgentZ` instead; this map is for
 * legacy / workflow-style agents that call `getToolsForTier` directly.
 */
export function getToolsForTier(tier: AgentTier) {
  const mod_note = {
    description: "Record a moderation note (mod/admin).",
    inputSchema: z.object({ note: z.string() }),
    execute: async (
      { note }: { note: string },
      options: { experimental_context?: unknown }
    ) => {
      const ctx = options.experimental_context as TierToolContext | undefined;
      return { saved: true, tier: ctx?.tier, note };
    },
  };

  const admin_config_hint = {
    description: "Tell the user that roles, model, and channels are configured in the /admin web UI.",
    inputSchema: z.object({}),
    execute: async () => ({
      message:
        "Use the Agent Z admin UI (/admin) to change model, roles, channels, and feature flags.",
    }),
  };

  if (tier === "admin") {
    return {
      mod_note,
      admin_config_hint,
      discord_api_read: makeDiscordApiReadTool(tier),
      discord_send_message: makeDiscordSendMessageTool(tier),
      discord_timeout_member: makeDiscordTimeoutMemberTool(tier),
      discord_assign_member_role: makeDiscordMemberRoleTool(tier, "assign"),
      discord_remove_member_role: makeDiscordMemberRoleTool(tier, "remove"),
    };
  }
  if (tier === "mod") {
    return {
      mod_note,
      discord_api_read: makeDiscordApiReadTool(tier),
    };
  }
  return {};
}

const queryValueSchema = z.union([z.string(), z.number(), z.boolean()]);
const discordReadSchema = z.object({
  path: z.string().min(1).refine((path) => path.startsWith("/"), "path must start with /"),
  query: z.record(z.string(), z.union([queryValueSchema, z.array(queryValueSchema)])).optional(),
  reason: z.string().max(512).optional(),
});

const sendMessageSchema = z.object({
  channelId: z.string().regex(/^\d{17,20}$/),
  content: z.string().min(1).max(2_000),
  replyToMessageId: z.string().regex(/^\d{17,20}$/).optional(),
});

const timeoutMemberSchema = z.object({
  guildId: z.string().regex(/^\d{17,20}$/),
  userId: z.string().regex(/^\d{17,20}$/),
  communicationDisabledUntil: z.string().datetime().nullable(),
  reason: z.string().max(512).optional(),
});

const memberRoleSchema = z.object({
  guildId: z.string().regex(/^\d{17,20}$/),
  userId: z.string().regex(/^\d{17,20}$/),
  roleId: z.string().regex(/^\d{17,20}$/),
  reason: z.string().max(512).optional(),
});

function makeDiscordApiReadTool(tier: AgentTier) {
  return {
    description:
      "Read from the Discord HTTP API for this server. Use this for live Discord data queries. Method is fixed to GET; pass any Discord API path beginning with `/`, such as `/guilds/{guild.id}`, `/guilds/{guild.id}/channels`, `/guilds/{guild.id}/members/{user_id}`, `/channels/{channel_id}/messages`, or other documented read endpoints. Channel paths are verified against the invocation guild before use. For writes or moderation, use the explicit named tools instead.",
    inputSchema: discordReadSchema,
    execute: async (
      input: z.infer<typeof discordReadSchema>,
      options: { experimental_context?: unknown }
    ) => {
      const ctx = options.experimental_context as TierToolContext | undefined;
      if (tier !== "admin" && tier !== "mod") {
        return "Live Discord API reads are not available at this access level.";
      }

      try {
        const config = loadDiscordToolConfig();
        return await executeDiscordApiRead(config, input as DiscordApiReadInput, buildCapabilityContext("discord_api_read", tier, ctx));
      } catch (error) {
        return `Discord API error: ${error instanceof Error ? error.message : String(error)}`;
      }
    },
  };
}

function makeDiscordSendMessageTool(tier: AgentTier) {
  return {
    description:
      "Post a non-mentioning staff/admin message to a Discord channel. Admin-only. Use for approved staff communication, not for normal answers.",
    inputSchema: sendMessageSchema,
    execute: async (
      input: z.infer<typeof sendMessageSchema>,
      options: { experimental_context?: unknown }
    ) => {
      const ctx = options.experimental_context as TierToolContext | undefined;
      if (tier !== "admin") {
        return "Sending Discord messages requires admin access.";
      }
      try {
        const config = loadDiscordToolConfig();
        return await executeDiscordSendMessage(config, input, buildCapabilityContext("discord_send_message", tier, ctx));
      } catch (error) {
        return `Discord API error: ${error instanceof Error ? error.message : String(error)}`;
      }
    },
  };
}

function makeDiscordTimeoutMemberTool(tier: AgentTier) {
  return {
    description:
      "Timeout or clear timeout for a guild member. Admin-only and protected users are blocked. Use an ISO timestamp for communicationDisabledUntil, or null to clear.",
    inputSchema: timeoutMemberSchema,
    execute: async (
      input: z.infer<typeof timeoutMemberSchema>,
      options: { experimental_context?: unknown }
    ) => {
      const ctx = options.experimental_context as TierToolContext | undefined;
      if (tier !== "admin") {
        return "Member moderation requires admin access.";
      }
      try {
        const config = loadDiscordToolConfig();
        return await executeDiscordTimeoutMember(config, input, buildCapabilityContext("discord_timeout_member", tier, ctx));
      } catch (error) {
        return `Discord API error: ${error instanceof Error ? error.message : String(error)}`;
      }
    },
  };
}

function makeDiscordMemberRoleTool(tier: AgentTier, action: "assign" | "remove") {
  const capabilityId = action === "assign" ? "discord_assign_member_role" : "discord_remove_member_role";
  return {
    description:
      action === "assign"
        ? "Assign a role to a guild member. Admin-only; guild and protected-user guards apply."
        : "Remove a role from a guild member. Admin-only; protected user and verified-role guards apply.",
    inputSchema: memberRoleSchema,
    execute: async (
      input: z.infer<typeof memberRoleSchema>,
      options: { experimental_context?: unknown }
    ) => {
      const ctx = options.experimental_context as TierToolContext | undefined;
      if (tier !== "admin") {
        return "Role changes require admin access.";
      }
      try {
        const config = loadDiscordToolConfig();
        return await executeDiscordMemberRoleUpdate(config, input, buildCapabilityContext(capabilityId, tier, ctx), action);
      } catch (error) {
        return `Discord API error: ${error instanceof Error ? error.message : String(error)}`;
      }
    },
  };
}

function buildCapabilityContext(capabilityId: string, tier: AgentTier, ctx: TierToolContext | undefined) {
  return {
    capabilityId,
    tier,
    invokerUserId: ctx?.invokerUserId,
    expectedGuildId: ctx?.discordContext?.guildId,
  };
}
