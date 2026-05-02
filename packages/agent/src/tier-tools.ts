import { z } from "zod";
import { listBundledDocPaths, readBundledDoc } from "@repo/knowledge";
import {
  assertGuildAllowed,
  assertNotDeletingVerifiedRole,
  assertNotTargetingProtectedUser,
  buildDiscordRestCheatsheet,
  discordRequest,
  formatDiscordResponse,
  isDestructiveDiscordCall,
  loadDiscordToolConfig,
  ProtectedTargetError,
} from "@repo/discord-tools";
import type { AgentTier, DiscordInvocationContext } from "./types.js";

export type TierToolContext = {
  tier: AgentTier;
  discordContext?: DiscordInvocationContext;
  invokerUserId?: string;
};

/**
 * Tier-scoped tool definitions for `DurableAgent` (description + inputSchema + execute).
 * Kept as plain objects to keep `tsc` fast (avoid heavy `ai` `tool()` generic instantiation).
 */
export function getToolsForTier(tier: AgentTier) {
  const tools = {
    ping: {
      description: "Health check — returns the active tier.",
      inputSchema: z.object({}),
      execute: async (
        _input: Record<string, never>,
        options: { experimental_context?: unknown }
      ) => {
        const ctx = options.experimental_context as TierToolContext | undefined;
        return { ok: true, tier: ctx?.tier ?? tier };
      },
    },
    summarize_intent: {
      description: "Log a one-phrase summary of the user's goal.",
      inputSchema: z.object({ phrase: z.string() }),
      execute: async ({ phrase }: { phrase: string }) => ({ logged: phrase }),
    },
    search_knowledge: {
      description:
        "Search the bundled Agent Z community knowledge docs for a short answer. Use this for questions about the server, project, or docs.",
      inputSchema: z.object({ query: z.string().min(1).max(200) }),
      execute: async ({ query }: { query: string }) => {
        "use step";
        const terms = query
          .toLowerCase()
          .split(/\W+/)
          .filter((term) => term.length >= 3);
        const files = await listBundledDocPaths();
        const matches = [];
        for (const file of files) {
          const content = await readBundledDoc(file);
          const haystack = content.toLowerCase();
          const score = terms.reduce((sum, term) => sum + (haystack.includes(term) ? 1 : 0), 0);
          if (score > 0 || terms.length === 0) {
            const title = content.match(/^title:\s*(.+)$/m)?.[1]?.trim() ?? file;
            const summary = content.match(/^summary:\s*(.+)$/m)?.[1]?.trim();
            matches.push({
              file,
              title,
              score,
              excerpt: (summary ?? content.replace(/^---[\s\S]*?---/, "").trim()).slice(0, 700),
            });
          }
        }
        return {
          query,
          matches: matches.sort((a, b) => b.score - a.score).slice(0, 3),
        };
      },
    },
    mod_note: {
      description: "Record a moderation note (mod/admin).",
      inputSchema: z.object({ note: z.string() }),
      execute: async (
        { note }: { note: string },
        options: { experimental_context?: unknown }
      ) => {
        const ctx = options.experimental_context as TierToolContext | undefined;
        return { saved: true, tier: ctx?.tier, note };
      },
    },
    admin_config_hint: {
      description:
        "Tell the user that roles, model, and channels are configured in the /admin web UI.",
      inputSchema: z.object({}),
      execute: async () => ({
        message:
          "Use the Agent Z admin UI (/admin) to change model, roles, channels, and feature flags.",
      }),
    },
    discord_api_request: makeDiscordApiRequestTool(tier),
  } as const;

  if (tier === "admin") {
    return {
      ping: tools.ping,
      summarize_intent: tools.summarize_intent,
      search_knowledge: tools.search_knowledge,
      mod_note: tools.mod_note,
      admin_config_hint: tools.admin_config_hint,
      discord_api_request: tools.discord_api_request,
    };
  }
  if (tier === "mod") {
    return {
      ping: tools.ping,
      summarize_intent: tools.summarize_intent,
      search_knowledge: tools.search_knowledge,
      mod_note: tools.mod_note,
      discord_api_request: tools.discord_api_request,
    };
  }
  return {
    ping: tools.ping,
    summarize_intent: tools.summarize_intent,
    search_knowledge: tools.search_knowledge,
  };
}

const queryValueSchema = z.union([z.string(), z.number(), z.boolean()]);
const discordRequestSchema = z.object({
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
  path: z.string().min(1).refine((path) => path.startsWith("/"), "path must start with /"),
  query: z.record(z.union([queryValueSchema, z.array(queryValueSchema)])).optional(),
  body: z.unknown().optional(),
  audit_reason: z.string().max(512).optional(),
});

function makeDiscordApiRequestTool(tier: AgentTier) {
  return {
    description:
      `Call the Discord HTTP API for this server. Mods are GET-only. Admins may use write methods, but destructive calls are blocked until an explicit approval flow is added.\n\n${buildDiscordRestCheatsheet(undefined)}`,
    inputSchema: discordRequestSchema,
    execute: async (
      input: z.infer<typeof discordRequestSchema>,
      options: { experimental_context?: unknown }
    ) => {
      const ctx = options.experimental_context as TierToolContext | undefined;
      if (tier !== "admin" && tier !== "mod") {
        return "Discord tools are not available at this access level.";
      }
      if (tier === "mod" && input.method !== "GET") {
        return "Read-only at this access level. Ask an admin.";
      }
      if (tier === "admin" && isDestructiveDiscordCall(input.method, input.path, input.body)) {
        return "That Discord action is destructive and needs an explicit confirmation flow before I can run it.";
      }

      try {
        const config = loadDiscordToolConfig();
        const allowedGuildIds = config.allowedGuildIds ?? (ctx?.discordContext?.guildId ? new Set([ctx.discordContext.guildId]) : null);
        assertGuildAllowed(input.path, allowedGuildIds);
        assertNotDeletingVerifiedRole(
          input.method,
          input.path,
          config.reactionVerifiedRoleId,
          config.mcpAllowDeleteVerifiedRole
        );
        assertNotTargetingProtectedUser(config.protectedOwnerUserId, input.method, input.path, input.body);
        const auditReason = input.audit_reason?.trim()
          ? `agent-z: ${ctx?.invokerUserId ?? "unknown"} - ${input.audit_reason}`.slice(0, 480)
          : `agent-z: ${ctx?.invokerUserId ?? "unknown"} - ${input.method} ${input.path}`.slice(0, 480);
        const result = await discordRequest(
          { ...config, allowedGuildIds },
          {
            method: input.method,
            path: input.path,
            query: input.query,
            body: input.body,
            auditReason,
          }
        );
        return formatDiscordResponse(result).slice(0, 12_000);
      } catch (error) {
        if (error instanceof ProtectedTargetError) {
          return "Can't do that one.";
        }
        return `Discord API error: ${error instanceof Error ? error.message : String(error)}`;
      }
    },
  };
}
