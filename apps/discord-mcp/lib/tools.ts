import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  executeDiscordApiRead,
  executeDiscordMemberRoleUpdate,
  executeDiscordSendMessage,
  executeDiscordTimeoutMember,
  loadDiscordToolConfig,
  type DiscordToolConfig,
} from "@repo/discord-tools";
import { confirmDestructive } from "./elicitation";
import { meetsTier, resolveTier, type Tier } from "./tier";
import type { Actor } from "./auth";

type McpToolContext = {
  authInfo?: {
    extra?: {
      actor?: Actor;
    };
  };
  request?: {
    sendRequest?: (
      method: string,
      params: unknown,
      schema: unknown,
      options?: { timeout?: number }
    ) => Promise<unknown>;
  };
};

type ToolResultContent = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
};

const SNOWFLAKE = z.string().regex(/^\d{17,20}$/, "must be a Discord snowflake");

const queryValue = z.union([z.string(), z.number(), z.boolean()]);

/** Compose a structured text response. */
function textResult(text: string, opts?: { isError?: boolean }): ToolResultContent {
  return {
    content: [{ type: "text", text }],
    isError: opts?.isError === true ? true : undefined,
  };
}

async function readActor(ctx: McpToolContext): Promise<{ actor: Actor; tier: Tier } | { error: string }> {
  const actor = ctx.authInfo?.extra?.actor;
  if (!actor) {
    return { error: "Missing actor headers; the MCP client did not forward Discord identity (X-Actor-Discord-*)." };
  }
  const tier = await resolveTier(actor);
  return { actor, tier };
}

function tierGate(actual: Tier, required: Tier, action: string): ToolResultContent | null {
  if (meetsTier(actual, required)) return null;
  return textResult(
    `Insufficient tier for "${action}". This tool requires the ${required} role tier; the caller resolves to ${actual}.`,
    { isError: true }
  );
}

let cachedDiscordConfig: DiscordToolConfig | null = null;
function getDiscordConfig(): DiscordToolConfig {
  if (!cachedDiscordConfig) {
    cachedDiscordConfig = loadDiscordToolConfig();
  }
  return cachedDiscordConfig;
}

export function registerTools(server: McpServer) {
  // ─── discord_api_read ───────────────────────────────────────────────────
  server.registerTool(
    "discord_api_read",
    {
      title: "Discord API Read",
      description:
        "Read from the Discord HTTP API (api v10). Method is fixed to GET. Pass a documented Discord API path beginning with `/`. Channel paths are verified against the actor's guild before use.",
      inputSchema: {
        path: z
          .string()
          .min(1)
          .refine((p) => p.startsWith("/"), "path must start with /"),
        query: z.record(z.union([queryValue, z.array(queryValue)])).optional(),
        reason: z.string().max(512).optional(),
      },
    },
    async ({ path, query, reason }, ctx) => {
      const auth = await readActor(ctx as McpToolContext);
      if ("error" in auth) return textResult(auth.error, { isError: true });
      const denied = tierGate(auth.tier, "mod", "discord_api_read");
      if (denied) return denied;
      try {
        const text = await executeDiscordApiRead(getDiscordConfig(), { path, query, reason }, {
          capabilityId: "discord_api_read",
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

  // ─── discord_send_message ───────────────────────────────────────────────
  server.registerTool(
    "discord_send_message",
    {
      title: "Send Message",
      description:
        "Post a non-mentioning operator message to a Discord channel. Admin-only. The message is sent with the bot's identity; @-mentions are stripped via allowed_mentions.",
      inputSchema: {
        channelId: SNOWFLAKE,
        content: z.string().min(1).max(2000),
        replyToMessageId: SNOWFLAKE.optional(),
      },
    },
    async (input, ctx) => {
      const auth = await readActor(ctx as McpToolContext);
      if ("error" in auth) return textResult(auth.error, { isError: true });
      const denied = tierGate(auth.tier, "admin", "discord_send_message");
      if (denied) return denied;
      try {
        const text = await executeDiscordSendMessage(getDiscordConfig(), input, {
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

  // ─── discord_timeout_member ─────────────────────────────────────────────
  server.registerTool(
    "discord_timeout_member",
    {
      title: "Timeout Member",
      description:
        "Timeout or clear timeout for a guild member. Admin-only; protected users are blocked. Use an ISO timestamp for `communicationDisabledUntil`, or null to clear.",
      inputSchema: {
        guildId: SNOWFLAKE,
        userId: SNOWFLAKE,
        communicationDisabledUntil: z.string().datetime().nullable(),
        reason: z.string().max(512).optional(),
      },
    },
    async (input, ctx) => {
      const auth = await readActor(ctx as McpToolContext);
      if ("error" in auth) return textResult(auth.error, { isError: true });
      const denied = tierGate(auth.tier, "admin", "discord_timeout_member");
      if (denied) return denied;
      try {
        const text = await executeDiscordTimeoutMember(getDiscordConfig(), input, {
          capabilityId: "discord_timeout_member",
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

  // ─── discord_assign_member_role / discord_remove_member_role ────────────
  for (const action of ["assign", "remove"] as const) {
    const toolName = action === "assign" ? "discord_assign_member_role" : "discord_remove_member_role";
    server.registerTool(
      toolName,
      {
        title: action === "assign" ? "Assign Role" : "Remove Role",
        description:
          action === "assign"
            ? "Assign a role to a guild member. Admin-only; guild allowlist and protected-user guards apply."
            : "Remove a role from a guild member. Admin-only; protected user and verified-role guards apply.",
        inputSchema: {
          guildId: SNOWFLAKE,
          userId: SNOWFLAKE,
          roleId: SNOWFLAKE,
          reason: z.string().max(512).optional(),
        },
      },
      async (input, ctx) => {
        const auth = await readActor(ctx as McpToolContext);
        if ("error" in auth) return textResult(auth.error, { isError: true });
        const denied = tierGate(auth.tier, "admin", toolName);
        if (denied) return denied;
        try {
          const text = await executeDiscordMemberRoleUpdate(
            getDiscordConfig(),
            input,
            {
              capabilityId: toolName,
              tier: auth.tier,
              invokerUserId: auth.actor.userId,
              expectedGuildId: auth.actor.guildId,
            },
            action
          );
          return textResult(text);
        } catch (error) {
          return textResult(`Discord API error: ${error instanceof Error ? error.message : String(error)}`, {
            isError: true,
          });
        }
      }
    );
  }

  // ─── bulk_delete_messages (elicitation demo) ────────────────────────────
  server.registerTool(
    "bulk_delete_messages",
    {
      title: "Bulk Delete Messages",
      description:
        "Bulk-delete the last N messages from a channel using Discord's bulk-delete endpoint (2-100, less than 14 days old). Admin-only. For N > 50 the caller is asked to confirm via MCP elicitation; bypass with `preConfirmed: true`.",
      inputSchema: {
        channelId: SNOWFLAKE,
        count: z.number().int().min(2).max(100),
        reason: z.string().max(512).optional(),
        preConfirmed: z.boolean().optional(),
      },
    },
    async (input, ctx) => {
      const auth = await readActor(ctx as McpToolContext);
      if ("error" in auth) return textResult(auth.error, { isError: true });
      const denied = tierGate(auth.tier, "admin", "bulk_delete_messages");
      if (denied) return denied;

      const confirmation = await confirmDestructive(ctx as McpToolContext, {
        action: "bulk_delete_messages",
        impactSummary: `delete the last ${input.count} messages in <#${input.channelId}>`,
        count: input.count,
        threshold: 50,
        preConfirmed: input.preConfirmed,
      });
      if (!confirmation.confirmed) {
        return textResult(`Aborted: ${confirmation.reason}`, { isError: true });
      }

      try {
        // Use discord_api_read style of audit reasoning by going through executeDiscordApiRead is wrong — we need
        // to actually POST. Stand up directly via discordRequest from the capability config to keep the same
        // guards (guild allowlist, audit reason).
        const config = getDiscordConfig();
        const { discordRequest, formatDiscordResponse } = await import("@repo/discord-tools");
        const messages = await discordRequest(config, {
          method: "GET",
          path: `/channels/${input.channelId}/messages`,
          query: { limit: input.count },
          auditReason: `agent-z: ${auth.actor.userId ?? "?"} bulk_delete_messages ${auth.tier} - inspect`,
        });
        if (messages.status < 200 || messages.status >= 300) {
          return textResult(
            `Could not list messages for bulk delete: Discord returned ${messages.status}.`,
            { isError: true }
          );
        }
        const messageIds = Array.isArray(messages.body)
          ? messages.body.flatMap((entry) =>
              entry && typeof entry === "object" && !Array.isArray(entry) && typeof (entry as { id?: unknown }).id === "string"
                ? [(entry as { id: string }).id]
                : []
            )
          : [];
        if (messageIds.length < 2) {
          return textResult(
            "Bulk delete needs at least 2 eligible messages. Found fewer than 2 deletable messages in the requested window.",
            { isError: true }
          );
        }
        const deleteResult = await discordRequest(config, {
          method: "POST",
          path: `/channels/${input.channelId}/messages/bulk-delete`,
          body: { messages: messageIds },
          auditReason: `agent-z: ${auth.actor.userId ?? "?"} bulk_delete_messages ${auth.tier} - ${input.reason ?? "no reason"}`.slice(
            0,
            480
          ),
        });
        if (deleteResult.status < 200 || deleteResult.status >= 300) {
          return textResult(
            `Bulk delete failed: ${formatDiscordResponse(deleteResult)}`,
            { isError: true }
          );
        }
        return textResult(`Deleted ${messageIds.length} messages from <#${input.channelId}>.`);
      } catch (error) {
        return textResult(`Discord API error: ${error instanceof Error ? error.message : String(error)}`, {
          isError: true,
        });
      }
    }
  );
}
