import { tool } from "ai";
import { z } from "zod";
import { buildDiscordRestCheatsheet } from "./cheatsheet.js";
import { waitForDestructiveConfirm } from "./confirmations.js";
import { isDestructiveDiscordCall } from "./destructive.js";
import type { AgentZConfig } from "./botConfig.js";
import { discordRequest, type HttpMethod } from "./discordRest.js";
import {
  fetchUrlText,
  listTopics,
  readTopic,
  searchDocs,
} from "./knowledge.js";
import { assertNotTargetingProtectedUser, ProtectedTargetError } from "./protectedUser.js";
import type { AccessTier } from "./tiers.js";
import { enforceTierForCall, TierError } from "./tiers.js";
import type { GuildTextBasedChannel, User } from "discord.js";

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

function formatDiscordResult(result: Awaited<ReturnType<typeof discordRequest>>): string {
  const rate = {
    limit: result.headers["x-ratelimit-limit"],
    remaining: result.headers["x-ratelimit-remaining"],
  };
  return JSON.stringify(
    { status: result.status, rateLimit: rate, body: result.body },
    null,
    2
  );
}

export type ToolBuildContext = {
  cfg: AgentZConfig;
  tier: AccessTier;
  guildId: string;
  channel: GuildTextBasedChannel;
  invoker: User;
  invokerDisplay: string;
  memberRoleIds: string[];
};

function discordInputSchema(allowed: "GET" | "ALL") {
  const methodField =
    allowed === "GET"
      ? z.literal("GET")
      : z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"] as [HttpMethod, ...HttpMethod[]]);
  return z.object({
    method: methodField,
    path: z
      .string()
      .describe("API path starting with /"),
    query: querySchema,
    body: z.unknown().optional(),
    audit_reason: z
      .string()
      .max(512)
      .optional()
      .describe("X-Audit-Log-Reason for mutating admin actions"),
  });
}

function makeDiscordApiTool(ctx: ToolBuildContext, allowed: "GET" | "ALL") {
  const cs = buildDiscordRestCheatsheet(ctx.guildId);
  const disc =
    "discord_api_request — Discord REST. " + cs.slice(0, 3500);
  return tool({
    description: disc,
    inputSchema: discordInputSchema(allowed),
    execute: async (input) => {
      const method = input.method as HttpMethod;
      try {
        enforceTierForCall(ctx.tier, method);
        assertNotTargetingProtectedUser(ctx.cfg, method, input.path, input.body);
        if (isDestructiveDiscordCall(method, input.path, input.body)) {
          const ok = await waitForDestructiveConfirm({
            channel: ctx.channel,
            invoker: ctx.invoker,
            summary: `**${method}** \`${input.path}\`\n-# Requested by ${ctx.invokerDisplay}`,
          });
          if (!ok) {
            return "User declined confirmation; action not performed.";
          }
        }
        const audit = input.audit_reason?.trim()
          ? `agent-z: ${ctx.invokerDisplay} — ${input.audit_reason}`.slice(0, 480)
          : `agent-z: ${ctx.invokerDisplay} — ${method} ${input.path}`.slice(0, 480);
        const res = await discordRequest(ctx.cfg, {
          method,
          path: input.path,
          query: input.query,
          body: input.body,
          auditReason: audit,
        });
        return formatDiscordResult(res);
      } catch (e) {
        if (e instanceof ProtectedTargetError) {
          return "Can't do that one.";
        }
        if (e instanceof TierError) {
          return e.message;
        }
        const msg = e instanceof Error ? e.message : String(e);
        return `Error: ${msg}`;
      }
    },
  });
}

const searchTool = (ctx: ToolBuildContext) =>
  tool({
    description:
      "search_vercel_docs — BM25 search over bundled Vercel + shadcn markdown. Use first for Vercel/shadcn questions.",
    inputSchema: z.object({
      query: z.string().describe("Search query"),
      k: z.number().int().min(1).max(10).optional().describe("Number of results (default 3)"),
    }),
    execute: async ({ query, k }) => {
      const r = await searchDocs(ctx.cfg, query, k ?? 3);
      if (r.length === 0) {
        return "No matches. Try list_vercel_topics or fetch_url to official docs.";
      }
      return r.map((x) => `- **${x.title}** (id: \`${x.id}\`, score: ${x.score.toFixed(2)}): ${x.snippet.slice(0, 240)}`).join("\n");
    },
  });

const listTool = (ctx: ToolBuildContext) =>
  tool({
    description: "list_vercel_topics — list all bundled knowledge topic titles and ids.",
    inputSchema: z.object({}),
    execute: async () => {
      const rows = await listTopics(ctx.cfg);
      if (!rows.length) {
        return "No topics. Run `npm run knowledge:sync` with AGENT_Z_KNOWLEDGE_SOURCE.";
      }
      return rows.map((t) => `- \`${t.id}\` — **${t.title}**`).join("\n");
    },
  });

const readTool = (ctx: ToolBuildContext) =>
  tool({
    description: "read_vercel_topic — full text of one bundled topic by id (from list or search).",
    inputSchema: z.object({ id: z.string().describe("Topic id from list_vercel_topics") }),
    execute: async ({ id }) => readTopic(ctx.cfg, id),
  });

const fetchUrlTool = tool({
  description:
    "fetch_url — fetch https from allowlisted doc hosts (vercel.com, nextjs.org, shadcn, sdk.vercel.ai, discord.com) as last resort.",
  inputSchema: z.object({ url: z.string().url() }),
  execute: async ({ url }) => fetchUrlText(url),
});

export function buildAgentTools(
  ctx: ToolBuildContext
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Record<string, any> {
  const base: Record<string, any> = {
    search_vercel_docs: searchTool(ctx),
    list_vercel_topics: listTool(ctx),
    read_vercel_topic: readTool(ctx),
    fetch_url: fetchUrlTool,
  };
  if (ctx.tier === "DENY") {
    return {};
  }
  if (ctx.tier === "ADMIN") {
    return {
      ...base,
      discord_api_request: makeDiscordApiTool(ctx, "ALL"),
    };
  }
  if (ctx.tier === "MOD") {
    return {
      ...base,
      discord_api_request: makeDiscordApiTool(ctx, "GET"),
    };
  }
  return base;
}
