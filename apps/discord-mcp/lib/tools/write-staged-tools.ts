import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { stagePendingActionFromMcp } from "../stage-pending";
import { getCachedRoleTierMatrix } from "../tier";
import { resolveTargetMemberTier, tierBlocksAgentModeration } from "../target-tier";
import {
  type McpToolContext,
  readActor,
  SNOWFLAKE,
  textResult,
  tierGate,
} from "./tool-common";

const jsonBody = z.record(z.string(), z.unknown());

function registerStaged(
  server: McpServer,
  toolName: string,
  capability: string,
  description: string,
  shape: z.ZodObject<Record<string, z.ZodTypeAny>>
) {
  const inputSchema = shape.extend({
    summary: z
      .string()
      .min(4)
      .max(500)
      .describe("One-line description shown on the Confirm/Cancel prompt in Discord."),
  });
  server.registerTool(
    toolName,
    {
      title: toolName,
      description: `${description} Stages the mutation server-side; returns JSON with paToken — Confirm/Cancel UI is attached by the host.`,
      inputSchema,
    },
    async (rawInput, ctx) => {
      const auth = await readActor(ctx as McpToolContext);
      if ("error" in auth) return textResult(auth.error, { isError: true });
      const denied = tierGate(auth.tier, "admin", toolName);
      if (denied) return denied;

      const parsed = inputSchema.safeParse(rawInput);
      if (!parsed.success) {
        return textResult(`Invalid input: ${parsed.error.message}`, { isError: true });
      }
      const { summary: parsedSummary, ...input } = parsed.data;
      const summary = parsedSummary as string;
      const inp = input as Record<string, unknown>;
      const gid = typeof inp.guildId === "string" ? inp.guildId.trim() : "";
      const uid = typeof inp.userId === "string" ? inp.userId.trim() : "";
      if (gid && uid && /^\d{17,20}$/.test(gid) && /^\d{17,20}$/.test(uid)) {
        const matrix = await getCachedRoleTierMatrix();
        const targetTier = await resolveTargetMemberTier({ guildId: gid, userId: uid, matrix });
        if (tierBlocksAgentModeration(targetTier)) {
          return textResult(
            "Refused: target user has the **admin** tier (role mapping) and cannot be moderated by Agent Z. Ask the server owner to act manually.",
            { isError: true }
          );
        }
      }
      const staged = await stagePendingActionFromMcp({
        actor: auth.actor,
        capability,
        input: input as Record<string, unknown>,
        summary,
      });
      if ("error" in staged) return textResult(staged.error, { isError: true });
      return textResult(
        JSON.stringify({
          staged: true,
          paToken: staged.token,
          summary,
        })
      );
    }
  );
}

export function registerWriteStagedTools(server: McpServer) {
  registerStaged(
    server,
    "discord_kick_member",
    "kick_member",
    "Remove a member from the guild.",
    z.object({
      guildId: SNOWFLAKE,
      userId: SNOWFLAKE,
      reason: z.string().max(512).optional(),
    })
  );
  registerStaged(
    server,
    "discord_ban_member",
    "ban_member",
    "Ban a user.",
    z.object({
      guildId: SNOWFLAKE,
      userId: SNOWFLAKE,
      deleteMessageSeconds: z.number().int().nullable().optional(),
      reason: z.string().max(512).optional(),
    })
  );
  registerStaged(
    server,
    "discord_unban_member",
    "unban_member",
    "Remove ban for user.",
    z.object({
      guildId: SNOWFLAKE,
      userId: SNOWFLAKE,
      reason: z.string().max(512).optional(),
    })
  );
  registerStaged(
    server,
    "discord_timeout_member",
    "timeout_member",
    "Timeout or clear timeout.",
    z.object({
      guildId: SNOWFLAKE,
      userId: SNOWFLAKE,
      communicationDisabledUntil: z.string().datetime().nullable(),
      reason: z.string().max(512).optional(),
    })
  );
  registerStaged(
    server,
    "discord_assign_member_role",
    "assign_member_role",
    "Add role to member.",
    z.object({
      guildId: SNOWFLAKE,
      userId: SNOWFLAKE,
      roleId: SNOWFLAKE,
      reason: z.string().max(512).optional(),
    })
  );
  registerStaged(
    server,
    "discord_remove_member_role",
    "remove_member_role",
    "Remove role from member.",
    z.object({
      guildId: SNOWFLAKE,
      userId: SNOWFLAKE,
      roleId: SNOWFLAKE,
      reason: z.string().max(512).optional(),
    })
  );
  registerStaged(
    server,
    "discord_set_member_nickname",
    "set_member_nickname",
    "Set or clear nickname.",
    z.object({
      guildId: SNOWFLAKE,
      userId: SNOWFLAKE,
      nick: z.string().max(32).nullable(),
      reason: z.string().max(512).optional(),
    })
  );
  registerStaged(
    server,
    "discord_move_member_voice",
    "move_member_voice",
    "Move member to voice channel or disconnect (null).",
    z.object({
      guildId: SNOWFLAKE,
      userId: SNOWFLAKE,
      channelId: SNOWFLAKE.nullable(),
      reason: z.string().max(512).optional(),
    })
  );
  registerStaged(
    server,
    "discord_create_channel",
    "create_channel",
    "Create a guild channel (JSON body per Discord API).",
    z.object({
      guildId: SNOWFLAKE,
      body: jsonBody,
      reason: z.string().max(512).optional(),
    })
  );
  registerStaged(
    server,
    "discord_edit_channel",
    "edit_channel",
    "Patch a channel.",
    z.object({
      channelId: SNOWFLAKE,
      body: jsonBody,
      reason: z.string().max(512).optional(),
    })
  );
  registerStaged(
    server,
    "discord_delete_channel",
    "delete_channel",
    "Delete a channel.",
    z.object({
      channelId: SNOWFLAKE,
      reason: z.string().max(512).optional(),
    })
  );
  registerStaged(
    server,
    "discord_create_invite",
    "create_invite",
    "Create channel invite.",
    z.object({
      channelId: SNOWFLAKE,
      body: jsonBody.optional(),
      reason: z.string().max(512).optional(),
    })
  );
  registerStaged(
    server,
    "discord_create_role",
    "create_role",
    "Create guild role.",
    z.object({
      guildId: SNOWFLAKE,
      body: jsonBody.optional(),
      reason: z.string().max(512).optional(),
    })
  );
  registerStaged(
    server,
    "discord_edit_role",
    "edit_role",
    "Patch guild role.",
    z.object({
      guildId: SNOWFLAKE,
      roleId: SNOWFLAKE,
      body: jsonBody,
      reason: z.string().max(512).optional(),
    })
  );
  registerStaged(
    server,
    "discord_delete_role",
    "delete_role",
    "Delete guild role.",
    z.object({
      guildId: SNOWFLAKE,
      roleId: SNOWFLAKE,
      reason: z.string().max(512).optional(),
    })
  );
  registerStaged(
    server,
    "discord_reorder_roles",
    "reorder_roles",
    "PATCH guild roles order.",
    z.object({
      guildId: SNOWFLAKE,
      rolePositions: z.array(
        z.object({
          id: SNOWFLAKE,
          position: z.number().int(),
        })
      ),
      reason: z.string().max(512).optional(),
    })
  );
  registerStaged(
    server,
    "discord_bulk_delete_messages",
    "bulk_delete_messages",
    "Bulk delete last N messages (2-100).",
    z.object({
      channelId: SNOWFLAKE,
      count: z.number().int().min(2).max(100),
      reason: z.string().max(512).optional(),
    })
  );
  registerStaged(
    server,
    "discord_edit_message",
    "edit_message",
    "Edit a message.",
    z.object({
      channelId: SNOWFLAKE,
      messageId: SNOWFLAKE,
      body: jsonBody,
      reason: z.string().max(512).optional(),
    })
  );
  registerStaged(
    server,
    "discord_delete_message",
    "delete_message",
    "Delete single message.",
    z.object({
      channelId: SNOWFLAKE,
      messageId: SNOWFLAKE,
      reason: z.string().max(512).optional(),
    })
  );
  registerStaged(
    server,
    "discord_edit_thread_metadata",
    "edit_thread_metadata",
    "PATCH thread metadata (thread channel id).",
    z.object({
      channelId: SNOWFLAKE,
      body: jsonBody,
      reason: z.string().max(512).optional(),
    })
  );
  registerStaged(
    server,
    "discord_create_scheduled_event",
    "create_scheduled_event",
    "POST scheduled events.",
    z.object({
      guildId: SNOWFLAKE,
      body: jsonBody,
      reason: z.string().max(512).optional(),
    })
  );
  registerStaged(
    server,
    "discord_edit_scheduled_event",
    "edit_scheduled_event",
    "PATCH scheduled event.",
    z.object({
      guildId: SNOWFLAKE,
      eventId: SNOWFLAKE,
      body: jsonBody,
      reason: z.string().max(512).optional(),
    })
  );
  registerStaged(
    server,
    "discord_delete_scheduled_event",
    "delete_scheduled_event",
    "DELETE scheduled event.",
    z.object({
      guildId: SNOWFLAKE,
      eventId: SNOWFLAKE,
      reason: z.string().max(512).optional(),
    })
  );
  registerStaged(
    server,
    "discord_create_automod_rule",
    "create_automod_rule",
    "POST AutoMod rule.",
    z.object({
      guildId: SNOWFLAKE,
      body: jsonBody,
      reason: z.string().max(512).optional(),
    })
  );
  registerStaged(
    server,
    "discord_edit_automod_rule",
    "edit_automod_rule",
    "PATCH AutoMod rule.",
    z.object({
      guildId: SNOWFLAKE,
      ruleId: SNOWFLAKE,
      body: jsonBody,
      reason: z.string().max(512).optional(),
    })
  );
  registerStaged(
    server,
    "discord_delete_automod_rule",
    "delete_automod_rule",
    "DELETE AutoMod rule.",
    z.object({
      guildId: SNOWFLAKE,
      ruleId: SNOWFLAKE,
      reason: z.string().max(512).optional(),
    })
  );
  registerStaged(
    server,
    "discord_create_guild_emoji",
    "create_guild_emoji",
    "Create emoji (base64 image).",
    z.object({
      guildId: SNOWFLAKE,
      name: z.string().min(2).max(32),
      imageBase64: z.string().min(1),
      reason: z.string().max(512).optional(),
    })
  );
  registerStaged(
    server,
    "discord_delete_guild_emoji",
    "delete_guild_emoji",
    "DELETE guild emoji.",
    z.object({
      guildId: SNOWFLAKE,
      emojiId: SNOWFLAKE,
      reason: z.string().max(512).optional(),
    })
  );
  registerStaged(
    server,
    "discord_create_webhook",
    "create_webhook",
    "Create channel webhook.",
    z.object({
      channelId: SNOWFLAKE,
      body: jsonBody,
      reason: z.string().max(512).optional(),
    })
  );
  registerStaged(
    server,
    "discord_delete_webhook",
    "delete_webhook",
    "Delete webhook.",
    z.object({
      webhookId: SNOWFLAKE,
      token: z.string().optional(),
      reason: z.string().max(512).optional(),
    })
  );

  registerStaged(
    server,
    "bulk_delete_messages",
    "bulk_delete_messages",
    "Legacy name — same staging as discord_bulk_delete_messages.",
    z.object({
      channelId: SNOWFLAKE,
      count: z.number().int().min(2).max(100),
      reason: z.string().max(512).optional(),
    })
  );
}
