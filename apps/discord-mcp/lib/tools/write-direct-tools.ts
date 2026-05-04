import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { QueryRecord } from "@repo/discord-tools";
import {
  executeDiscordAddReaction,
  executeDiscordAddThreadMember,
  executeDiscordCreateThread,
  executeDiscordCreateThreadFromMessage,
  executeDiscordCrosspostMessage,
  executeDiscordFetchAuditLog,
  executeDiscordListGuildWebhooks,
  executeDiscordPinMessage,
  executeDiscordRemoveReaction,
  executeDiscordRemoveThreadMember,
  executeDiscordSendMessage,
  executeDiscordUnpinMessage,
} from "@repo/discord-tools";
import {
  resolveDiscordToolConfigForMcp,
  type McpToolContext,
  readActor,
  SNOWFLAKE,
  textResult,
  tierGate,
} from "./tool-common";

export function registerWriteDirectTools(server: McpServer) {
  server.registerTool(
    "discord_send_message",
    {
      title: "Send Message",
      description:
        "Post a bot message to a channel. @-mentions stripped. Requires mod+ and channel in invocation guild.",
      inputSchema: {
        channelId: SNOWFLAKE,
        content: z.string().min(1).max(2000),
        replyToMessageId: SNOWFLAKE.optional(),
      },
    },
    async (input, ctx) => {
      const auth = await readActor(ctx as McpToolContext);
      if ("error" in auth) return textResult(auth.error, { isError: true });
      const denied = tierGate(auth.tier, "mod", "discord_send_message");
      if (denied) return denied;
      try {
        const text = await executeDiscordSendMessage(await resolveDiscordToolConfigForMcp(), input, {
          capabilityId: "discord_send_message",
          tier: auth.tier,
          invokerUserId: auth.actor.userId,
          expectedGuildId: auth.actor.guildId,
        });
        return textResult(text);
      } catch (error) {
        return textResult(`Discord API error: ${error instanceof Error ? error.message : String(error)}`, {
          isError: true,
        });
      }
    }
  );

  server.registerTool(
    "discord_add_reaction",
    {
      title: "Add reaction",
      description: "Add a reaction (unicode or name:id). Mod+.",
      inputSchema: {
        channelId: SNOWFLAKE,
        messageId: SNOWFLAKE,
        emoji: z.string().min(1).max(200),
        reason: z.string().max(512).optional(),
      },
    },
    async (input, ctx) => {
      const auth = await readActor(ctx as McpToolContext);
      if ("error" in auth) return textResult(auth.error, { isError: true });
      const denied = tierGate(auth.tier, "mod", "discord_add_reaction");
      if (denied) return denied;
      try {
        const text = await executeDiscordAddReaction(await resolveDiscordToolConfigForMcp(), input, {
          capabilityId: "discord_add_reaction",
          tier: auth.tier,
          invokerUserId: auth.actor.userId,
          expectedGuildId: auth.actor.guildId,
        });
        return textResult(text);
      } catch (error) {
        return textResult(`Discord API error: ${error instanceof Error ? error.message : String(error)}`, {
          isError: true,
        });
      }
    }
  );

  server.registerTool(
    "discord_remove_reaction",
    {
      title: "Remove reaction",
      inputSchema: {
        channelId: SNOWFLAKE,
        messageId: SNOWFLAKE,
        emoji: z.string().min(1).max(200),
        userId: z.string().optional(),
        reason: z.string().max(512).optional(),
      },
    },
    async (input, ctx) => {
      const auth = await readActor(ctx as McpToolContext);
      if ("error" in auth) return textResult(auth.error, { isError: true });
      const denied = tierGate(auth.tier, "mod", "discord_remove_reaction");
      if (denied) return denied;
      try {
        const text = await executeDiscordRemoveReaction(await resolveDiscordToolConfigForMcp(), input, {
          capabilityId: "discord_remove_reaction",
          tier: auth.tier,
          invokerUserId: auth.actor.userId,
          expectedGuildId: auth.actor.guildId,
        });
        return textResult(text);
      } catch (error) {
        return textResult(`Discord API error: ${error instanceof Error ? error.message : String(error)}`, {
          isError: true,
        });
      }
    }
  );

  server.registerTool(
    "discord_pin_message",
    {
      title: "Pin message",
      inputSchema: {
        channelId: SNOWFLAKE,
        messageId: SNOWFLAKE,
        reason: z.string().max(512).optional(),
      },
    },
    async (input, ctx) => {
      const auth = await readActor(ctx as McpToolContext);
      if ("error" in auth) return textResult(auth.error, { isError: true });
      const denied = tierGate(auth.tier, "mod", "discord_pin_message");
      if (denied) return denied;
      try {
        const text = await executeDiscordPinMessage(await resolveDiscordToolConfigForMcp(), input, {
          capabilityId: "discord_pin_message",
          tier: auth.tier,
          invokerUserId: auth.actor.userId,
          expectedGuildId: auth.actor.guildId,
        });
        return textResult(text);
      } catch (error) {
        return textResult(`Discord API error: ${error instanceof Error ? error.message : String(error)}`, {
          isError: true,
        });
      }
    }
  );

  server.registerTool(
    "discord_unpin_message",
    {
      title: "Unpin message",
      inputSchema: {
        channelId: SNOWFLAKE,
        messageId: SNOWFLAKE,
        reason: z.string().max(512).optional(),
      },
    },
    async (input, ctx) => {
      const auth = await readActor(ctx as McpToolContext);
      if ("error" in auth) return textResult(auth.error, { isError: true });
      const denied = tierGate(auth.tier, "mod", "discord_unpin_message");
      if (denied) return denied;
      try {
        const text = await executeDiscordUnpinMessage(await resolveDiscordToolConfigForMcp(), input, {
          capabilityId: "discord_unpin_message",
          tier: auth.tier,
          invokerUserId: auth.actor.userId,
          expectedGuildId: auth.actor.guildId,
        });
        return textResult(text);
      } catch (error) {
        return textResult(`Discord API error: ${error instanceof Error ? error.message : String(error)}`, {
          isError: true,
        });
      }
    }
  );

  server.registerTool(
    "discord_create_thread",
    {
      title: "Create thread",
      inputSchema: {
        channelId: SNOWFLAKE,
        body: z.record(z.string(), z.unknown()),
        reason: z.string().max(512).optional(),
      },
    },
    async (input, ctx) => {
      const auth = await readActor(ctx as McpToolContext);
      if ("error" in auth) return textResult(auth.error, { isError: true });
      const denied = tierGate(auth.tier, "mod", "discord_create_thread");
      if (denied) return denied;
      try {
        const text = await executeDiscordCreateThread(await resolveDiscordToolConfigForMcp(), input, {
          capabilityId: "discord_create_thread",
          tier: auth.tier,
          invokerUserId: auth.actor.userId,
          expectedGuildId: auth.actor.guildId,
        });
        return textResult(text);
      } catch (error) {
        return textResult(`Discord API error: ${error instanceof Error ? error.message : String(error)}`, {
          isError: true,
        });
      }
    }
  );

  server.registerTool(
    "discord_create_thread_from_message",
    {
      title: "Thread from message",
      inputSchema: {
        channelId: SNOWFLAKE,
        messageId: SNOWFLAKE,
        body: z.record(z.string(), z.unknown()),
        reason: z.string().max(512).optional(),
      },
    },
    async (input, ctx) => {
      const auth = await readActor(ctx as McpToolContext);
      if ("error" in auth) return textResult(auth.error, { isError: true });
      const denied = tierGate(auth.tier, "mod", "discord_create_thread_from_message");
      if (denied) return denied;
      try {
        const text = await executeDiscordCreateThreadFromMessage(await resolveDiscordToolConfigForMcp(), input, {
          capabilityId: "discord_create_thread_from_message",
          tier: auth.tier,
          invokerUserId: auth.actor.userId,
          expectedGuildId: auth.actor.guildId,
        });
        return textResult(text);
      } catch (error) {
        return textResult(`Discord API error: ${error instanceof Error ? error.message : String(error)}`, {
          isError: true,
        });
      }
    }
  );

  server.registerTool(
    "discord_add_thread_member",
    {
      title: "Add thread member",
      inputSchema: {
        threadId: SNOWFLAKE,
        userId: SNOWFLAKE,
        reason: z.string().max(512).optional(),
      },
    },
    async (input, ctx) => {
      const auth = await readActor(ctx as McpToolContext);
      if ("error" in auth) return textResult(auth.error, { isError: true });
      const denied = tierGate(auth.tier, "mod", "discord_add_thread_member");
      if (denied) return denied;
      try {
        const text = await executeDiscordAddThreadMember(await resolveDiscordToolConfigForMcp(), input, {
          capabilityId: "discord_add_thread_member",
          tier: auth.tier,
          invokerUserId: auth.actor.userId,
          expectedGuildId: auth.actor.guildId,
        });
        return textResult(text);
      } catch (error) {
        return textResult(`Discord API error: ${error instanceof Error ? error.message : String(error)}`, {
          isError: true,
        });
      }
    }
  );

  server.registerTool(
    "discord_remove_thread_member",
    {
      title: "Remove thread member",
      inputSchema: {
        threadId: SNOWFLAKE,
        userId: SNOWFLAKE,
        reason: z.string().max(512).optional(),
      },
    },
    async (input, ctx) => {
      const auth = await readActor(ctx as McpToolContext);
      if ("error" in auth) return textResult(auth.error, { isError: true });
      const denied = tierGate(auth.tier, "mod", "discord_remove_thread_member");
      if (denied) return denied;
      try {
        const text = await executeDiscordRemoveThreadMember(await resolveDiscordToolConfigForMcp(), input, {
          capabilityId: "discord_remove_thread_member",
          tier: auth.tier,
          invokerUserId: auth.actor.userId,
          expectedGuildId: auth.actor.guildId,
        });
        return textResult(text);
      } catch (error) {
        return textResult(`Discord API error: ${error instanceof Error ? error.message : String(error)}`, {
          isError: true,
        });
      }
    }
  );

  server.registerTool(
    "discord_crosspost_message",
    {
      title: "Crosspost announcement message",
      inputSchema: {
        channelId: SNOWFLAKE,
        messageId: SNOWFLAKE,
        reason: z.string().max(512).optional(),
      },
    },
    async (input, ctx) => {
      const auth = await readActor(ctx as McpToolContext);
      if ("error" in auth) return textResult(auth.error, { isError: true });
      const denied = tierGate(auth.tier, "mod", "discord_crosspost_message");
      if (denied) return denied;
      try {
        const text = await executeDiscordCrosspostMessage(await resolveDiscordToolConfigForMcp(), input, {
          capabilityId: "discord_crosspost_message",
          tier: auth.tier,
          invokerUserId: auth.actor.userId,
          expectedGuildId: auth.actor.guildId,
        });
        return textResult(text);
      } catch (error) {
        return textResult(`Discord API error: ${error instanceof Error ? error.message : String(error)}`, {
          isError: true,
        });
      }
    }
  );

  server.registerTool(
    "discord_fetch_audit_log",
    {
      title: "Audit log GET",
      inputSchema: {
        guildId: SNOWFLAKE,
        query: z
          .record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.array(z.union([z.string(), z.number()]))]))
          .optional(),
        reason: z.string().max(512).optional(),
      },
    },
    async (input, ctx) => {
      const auth = await readActor(ctx as McpToolContext);
      if ("error" in auth) return textResult(auth.error, { isError: true });
      const denied = tierGate(auth.tier, "mod", "discord_fetch_audit_log");
      if (denied) return denied;
      try {
        const text = await executeDiscordFetchAuditLog(
          await resolveDiscordToolConfigForMcp(),
          {
            guildId: input.guildId,
            query: input.query as QueryRecord | undefined,
            reason: input.reason,
          },
          {
            capabilityId: "discord_fetch_audit_log",
            tier: auth.tier,
            invokerUserId: auth.actor.userId,
            expectedGuildId: auth.actor.guildId,
          }
        );
        return textResult(text);
      } catch (error) {
        return textResult(`Discord API error: ${error instanceof Error ? error.message : String(error)}`, {
          isError: true,
        });
      }
    }
  );

  server.registerTool(
    "discord_list_guild_webhooks",
    {
      title: "List webhooks",
      inputSchema: {
        guildId: SNOWFLAKE,
        reason: z.string().max(512).optional(),
      },
    },
    async (input, ctx) => {
      const auth = await readActor(ctx as McpToolContext);
      if ("error" in auth) return textResult(auth.error, { isError: true });
      const denied = tierGate(auth.tier, "mod", "discord_list_guild_webhooks");
      if (denied) return denied;
      try {
        const text = await executeDiscordListGuildWebhooks(await resolveDiscordToolConfigForMcp(), input, {
          capabilityId: "discord_list_guild_webhooks",
          tier: auth.tier,
          invokerUserId: auth.actor.userId,
          expectedGuildId: auth.actor.guildId,
        });
        return textResult(text);
      } catch (error) {
        return textResult(`Discord API error: ${error instanceof Error ? error.message : String(error)}`, {
          isError: true,
        });
      }
    }
  );
}
