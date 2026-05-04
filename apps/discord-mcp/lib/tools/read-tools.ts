import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  executeDiscordApiRead,
  executeDiscordFetchMember,
  executeDiscordListAutoModRules,
  executeDiscordListGuildEmojis,
} from "@repo/discord-tools";
import {
  getDiscordConfig,
  McpToolContext,
  queryValue,
  readActor,
  SNOWFLAKE,
  textResult,
  tierGate,
} from "./tool-common";

export function registerReadTools(server: McpServer) {
  server.registerTool(
    "discord_api_read",
    {
      title: "Discord API Read",
      description:
        "Read from the Discord HTTP API (v10). GET only. Channel paths are verified against the actor's guild.",
      inputSchema: {
        path: z
          .string()
          .min(1)
          .refine((p) => p.startsWith("/"), "path must start with /"),
        query: z.record(z.string(), z.union([queryValue, z.array(queryValue)])).optional(),
        reason: z.string().max(512).optional(),
      },
    },
    async ({ path, query, reason }, ctx) => {
      const auth = await readActor(ctx as McpToolContext);
      if ("error" in auth) return textResult(auth.error, { isError: true });
      const denied = tierGate(auth.tier, "verified", "discord_api_read");
      if (denied) return denied;
      try {
        const text = await executeDiscordApiRead(
          getDiscordConfig(),
          { path, query, reason },
          {
            capabilityId: "discord_api_read",
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
    "discord_fetch_member",
    {
      title: "Fetch guild member",
      description: "GET /guilds/{guild}/members/{user} for the invocation guild.",
      inputSchema: {
        guildId: SNOWFLAKE,
        userId: SNOWFLAKE,
        reason: z.string().max(512).optional(),
      },
    },
    async (input, ctx) => {
      const auth = await readActor(ctx as McpToolContext);
      if ("error" in auth) return textResult(auth.error, { isError: true });
      const denied = tierGate(auth.tier, "verified", "discord_fetch_member");
      if (denied) return denied;
      try {
        const text = await executeDiscordFetchMember(getDiscordConfig(), input, {
          capabilityId: "discord_fetch_member",
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
    "discord_list_guild_emojis",
    {
      title: "List guild emojis",
      description: "GET /guilds/{guild}/emojis",
      inputSchema: {
        guildId: SNOWFLAKE,
        reason: z.string().max(512).optional(),
      },
    },
    async (input, ctx) => {
      const auth = await readActor(ctx as McpToolContext);
      if ("error" in auth) return textResult(auth.error, { isError: true });
      const denied = tierGate(auth.tier, "verified", "discord_list_guild_emojis");
      if (denied) return denied;
      try {
        const text = await executeDiscordListGuildEmojis(getDiscordConfig(), input, {
          capabilityId: "discord_list_guild_emojis",
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
    "discord_list_automod_rules",
    {
      title: "List AutoMod rules",
      description: "GET /guilds/{guild}/auto-moderation/rules",
      inputSchema: {
        guildId: SNOWFLAKE,
        reason: z.string().max(512).optional(),
      },
    },
    async (input, ctx) => {
      const auth = await readActor(ctx as McpToolContext);
      if ("error" in auth) return textResult(auth.error, { isError: true });
      const denied = tierGate(auth.tier, "verified", "discord_list_automod_rules");
      if (denied) return denied;
      try {
        const text = await executeDiscordListAutoModRules(getDiscordConfig(), input, {
          capabilityId: "discord_list_automod_rules",
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
