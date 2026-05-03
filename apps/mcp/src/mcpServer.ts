import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import type { AppConfig } from "./config.js";
import {
  assertGuildAllowed,
  assertNotDeletingVerifiedRole,
  assertNotTargetingProtectedUser,
  discordRequest,
  executeDiscordApiRead,
  executeDiscordMemberRoleUpdate,
  executeDiscordSendMessage,
  executeDiscordTimeoutMember,
  formatDiscordResponse,
} from "@repo/discord-tools";

const querySchema = z
  .record(
    z.string(),
    z.union([
      z.string(),
      z.number(),
      z.boolean(),
      z.array(z.union([z.string(), z.number()])),
    ])
  )
  .optional();

export function createDiscordMcpServer(config: AppConfig) {
  requireAllowedGuilds(config);

  const server = new McpServer({
    name: "discord-mcp",
    version: "1.0.0",
  });

  server.registerTool(
    "discord_api_read",
    {
      description:
        "Read from the Discord HTTP API (api v10). Method is fixed to GET; pass any documented Discord API path beginning with `/`. Channel paths are checked against DISCORD_ALLOWED_GUILD_IDS before use.",
      inputSchema: {
        path: z
          .string()
          .refine((p) => p.startsWith("/"), "path must start with /")
          .describe(
            "API path starting with /, e.g. /guilds/123456789012345678 or /channels/123456789012345678"
          ),
        query: querySchema.describe(
          "Optional query parameters (arrays become repeated keys per Discord array query rules)"
        ),
        reason: z
          .string()
          .max(512)
          .optional()
          .describe("Optional operator reason for audit/debug context"),
      },
    },
    async ({ path, query, reason }) => {
      const text = await executeDiscordApiRead(config, { path, query, reason }, {
        capabilityId: "mcp.discord_api_read",
        tier: "operator",
      });
      return {
        content: [{ type: "text" as const, text }],
      };
    }
  );

  server.registerTool(
    "discord_send_message",
    {
      description: "Post a non-mentioning operator message to a Discord channel.",
      inputSchema: {
        channelId: z.string().regex(/^\d{17,20}$/).describe("Channel snowflake id"),
        content: z.string().min(1).max(2000).describe("Message content"),
        replyToMessageId: z.string().regex(/^\d{17,20}$/).optional().describe("Optional message to reply to"),
      },
    },
    async (input) => {
      const text = await executeDiscordSendMessage(config, input, {
        capabilityId: "mcp.discord_send_message",
        tier: "operator",
      });
      return {
        content: [{ type: "text" as const, text }],
      };
    }
  );

  server.registerTool(
    "discord_timeout_member",
    {
      description: "Timeout or clear timeout for a guild member. Protected users are blocked.",
      inputSchema: {
        guildId: z.string().regex(/^\d{17,20}$/).describe("Guild snowflake id"),
        userId: z.string().regex(/^\d{17,20}$/).describe("User snowflake id"),
        communicationDisabledUntil: z.string().datetime().nullable().describe("ISO timestamp, or null to clear"),
        reason: z.string().max(512).optional(),
      },
    },
    async (input) => {
      const text = await executeDiscordTimeoutMember(config, input, {
        capabilityId: "mcp.discord_timeout_member",
        tier: "operator",
      });
      return {
        content: [{ type: "text" as const, text }],
      };
    }
  );

  for (const action of ["assign", "remove"] as const) {
    server.registerTool(
      action === "assign" ? "discord_assign_member_role" : "discord_remove_member_role",
      {
        description:
          action === "assign"
            ? "Assign a role to a guild member. Guild allowlist and protected-user guards apply."
            : "Remove a role from a guild member. Guild allowlist, protected-user, and verified-role guards apply.",
        inputSchema: {
          guildId: z.string().regex(/^\d{17,20}$/).describe("Guild snowflake id"),
          userId: z.string().regex(/^\d{17,20}$/).describe("User snowflake id"),
          roleId: z.string().regex(/^\d{17,20}$/).describe("Role snowflake id"),
          reason: z.string().max(512).optional(),
        },
      },
      async (input) => {
        const text = await executeDiscordMemberRoleUpdate(config, input, {
          capabilityId: action === "assign" ? "mcp.discord_assign_member_role" : "mcp.discord_remove_member_role",
          tier: "operator",
        }, action);
        return {
          content: [{ type: "text" as const, text }],
        };
      }
    );
  }

  if (["1", "true", "yes"].includes((process.env.MCP_ENABLE_RAW_DISCORD_API ?? "").trim().toLowerCase())) {
    registerRawDiscordApiTool(server, config);
  }

  return server;
}

function requireAllowedGuilds(config: AppConfig) {
  if (!config.allowedGuildIds?.size) {
    throw new Error("DISCORD_ALLOWED_GUILD_IDS is required for Discord MCP capability tools.");
  }
}

function registerRawDiscordApiTool(server: McpServer, config: AppConfig) {
  server.registerTool(
    "discord_api_request_raw",
    {
      description:
        "Break-glass raw Discord HTTP API access. Disabled unless MCP_ENABLE_RAW_DISCORD_API=1. Prefer capability tools.",
      inputSchema: {
        method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]).describe("HTTP method"),
        path: z.string().refine((p) => p.startsWith("/"), "path must start with /"),
        query: querySchema,
        body: z.unknown().optional(),
        audit_reason: z.string().max(512).optional(),
      },
    },
    async ({ method, path, query, body, audit_reason }) => {
      assertGuildAllowed(path, config.allowedGuildIds);
      assertNotDeletingVerifiedRole(
        method,
        path,
        config.reactionVerifiedRoleId,
        config.mcpAllowDeleteVerifiedRole
      );
      assertNotTargetingProtectedUser(config.protectedOwnerUserId, method, path, body);
      const result = await discordRequest(config, {
        method,
        path,
        query,
        body,
        auditReason: audit_reason,
      });
      return {
        content: [{ type: "text" as const, text: formatDiscordResponse(result) }],
      };
    }
  );
}
