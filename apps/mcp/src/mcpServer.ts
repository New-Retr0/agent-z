import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import type { AppConfig } from "./config.js";
import { discordRequest } from "./discordRest.js";
import { assertGuildAllowed } from "./guildAllowlist.js";
import { assertMcpNotDeletingVerifiedRole } from "./mcpRoleGuard.js";

const DISCORD_REST_CHEATSHEET = `Common REST (api v10) — also see Discord docs. Replace {guild.id} with your allowed guild.
Read: GET /guilds/{guild.id}/channels, GET /guilds/{guild.id}/roles, GET /guilds/{guild.id}/members/{user_id}, GET /channels/{id}/messages?limit=50, GET /guilds/{guild.id}/audit-logs?limit=25.
Write: POST /channels/{id}/messages, PATCH/DELETE /channels/{id}/messages/{message_id}, POST .../messages/bulk-delete, PUT/DELETE /guilds/{id}/bans/{user_id}, DELETE /guilds/{id}/members/{user_id} (kick), PATCH /guilds/{id}/members/{user_id} (timeout in body), member roles PUT/DELETE, POST/PATCH/DELETE /channels, etc. Paths must start with /; JSON body only.`;

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

function formatDiscordResponse(result: Awaited<ReturnType<typeof discordRequest>>) {
  const rate = {
    limit: result.headers["x-ratelimit-limit"],
    remaining: result.headers["x-ratelimit-remaining"],
    reset: result.headers["x-ratelimit-reset"],
    scope: result.headers["x-ratelimit-scope"],
    bucket: result.headers["x-ratelimit-bucket"],
  };
  const payload = {
    status: result.status,
    rateLimit: rate,
    body: result.body,
  };
  return JSON.stringify(payload, null, 2);
}

export function createDiscordMcpServer(config: AppConfig) {
  const server = new McpServer({
    name: "discord-mcp",
    version: "1.0.0",
  });

  server.registerTool(
    "discord_api_request",
    {
      description:
        `Call the Discord HTTP API (api v10). Bot token from env; never pass tokens in arguments. JSON bodies only (not multipart). DELETE on REACTION_VERIFIED_ROLE_ID is blocked unless MCP_ALLOW_DELETE_VERIFIED_ROLE=1.\n\n${DISCORD_REST_CHEATSHEET}`,
      inputSchema: {
        method: z
          .enum(["GET", "POST", "PUT", "PATCH", "DELETE"])
          .describe("HTTP method"),
        path: z
          .string()
          .refine((p) => p.startsWith("/"), "path must start with /")
          .describe(
            "API path starting with /, e.g. /guilds/123456789012345678 or /channels/123456789012345678"
          ),
        query: querySchema.describe(
          "Optional query parameters (arrays become repeated keys per Discord array query rules)"
        ),
        body: z
          .unknown()
          .optional()
          .describe("JSON body for POST, PUT, PATCH (omit for GET/DELETE)"),
        audit_reason: z
          .string()
          .max(512)
          .optional()
          .describe("Optional X-Audit-Log-Reason for mutating guild/admin actions"),
      },
    },
    async ({ method, path, query, body, audit_reason }) => {
      assertGuildAllowed(path, config.allowedGuildIds);
      assertMcpNotDeletingVerifiedRole(
        method,
        path,
        config.reactionVerifiedRoleId,
        config.mcpAllowDeleteVerifiedRole
      );
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

  server.registerTool(
    "discord_get_guild",
    {
      description: "Convenience: GET /guilds/{guild_id} — returns guild object.",
      inputSchema: {
        guild_id: z.string().regex(/^\d{17,20}$/).describe("Guild snowflake id"),
      },
    },
    async ({ guild_id }) => {
      const path = `/guilds/${guild_id}`;
      assertGuildAllowed(path, config.allowedGuildIds);
      const result = await discordRequest(config, { method: "GET", path });
      return {
        content: [{ type: "text" as const, text: formatDiscordResponse(result) }],
      };
    }
  );

  server.registerTool(
    "discord_modify_guild",
    {
      description:
        "Convenience: PATCH /guilds/{guild_id} — partial guild settings (see Discord Guild resource).",
      inputSchema: {
        guild_id: z.string().regex(/^\d{17,20}$/).describe("Guild snowflake id"),
        body: z.record(z.string(), z.unknown()).describe("Partial guild object fields to update"),
        audit_reason: z.string().max(512).optional(),
      },
    },
    async ({ guild_id, body, audit_reason }) => {
      const path = `/guilds/${guild_id}`;
      assertGuildAllowed(path, config.allowedGuildIds);
      const result = await discordRequest(config, {
        method: "PATCH",
        path,
        body,
        auditReason: audit_reason,
      });
      return {
        content: [{ type: "text" as const, text: formatDiscordResponse(result) }],
      };
    }
  );

  return server;
}
