/**
 * Oversight Layer MCP tools.
 *
 *   - `search_server_messages` — semantic search across the message archive
 *     via the apps/web `/api/oversight/search` endpoint (which generates the
 *     query embedding and runs the pgvector cosine search).
 *   - `find_user_messages` — recent messages from a specific user, no
 *     embedding step. Useful for "show me what @user posted today" flows.
 *   - `summarize_channel_activity` — pulls a window of messages from a
 *     channel for the agent to summarize.
 *
 * Tier policy:
 *   - All three tools are gated to `verified` so subscribed members can use
 *     them; admins automatically pass via `meetsTier`.
 *
 * The MCP runtime can't talk to the AI Gateway or pgvector directly without
 * dragging that whole stack in here, so we proxy semantic search through
 * apps/web. Listing/recent tools talk to the DB directly because they don't
 * need embeddings.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  listChannelMessages,
  listUserMessages,
  type ArchivedMessage,
} from "@repo/db";
import { meetsTier, resolveTier, type Tier } from "./tier";
import type { Actor } from "./auth";

type McpToolContext = {
  authInfo?: { extra?: { actor?: Actor } };
};

type ToolResultContent = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
};

const SNOWFLAKE = z.string().regex(/^\d{17,20}$/, "must be a Discord snowflake");

function textResult(text: string, opts?: { isError?: boolean }): ToolResultContent {
  return {
    content: [{ type: "text", text }],
    isError: opts?.isError === true ? true : undefined,
  };
}

async function requireTier(ctx: McpToolContext, required: Tier): Promise<Actor | null> {
  const actor = ctx.authInfo?.extra?.actor;
  if (!actor) return null;
  const tier = await resolveTier(actor);
  if (!meetsTier(tier, required)) return null;
  return actor;
}

function tierError(required: Tier): ToolResultContent {
  return textResult(
    `This tool requires the \`${required}\` tier. Ask a server admin to grant it.`,
    { isError: true }
  );
}

// ---------------------------------------------------------------- search_server_messages

const SearchInputSchema = z.object({
  query: z.string().min(1, "query is required").max(2000),
  limit: z.number().int().min(1).max(50).optional(),
  channelId: SNOWFLAKE.optional(),
  guildId: SNOWFLAKE.optional(),
  authorId: SNOWFLAKE.optional(),
  before: z.string().datetime().optional(),
  after: z.string().datetime().optional(),
  includeBots: z.boolean().optional(),
});

type SearchInput = z.infer<typeof SearchInputSchema>;

type SearchHit = {
  id: string;
  channelId: string;
  guildId: string | null;
  authorId: string;
  authorName: string | null;
  content: string;
  sentAt: string;
  similarity: number;
};

async function callSearchService(input: SearchInput): Promise<{
  ok: true;
  hits: SearchHit[];
} | { ok: false; error: string }> {
  const baseUrl = process.env.AGENT_Z_APP_BASE_URL?.trim()?.replace(/\/$/, "");
  const secret = process.env.AGENT_Z_INTERNAL_SECRET?.trim();
  if (!baseUrl || !secret) {
    return {
      ok: false,
      error:
        "Oversight search is unavailable: AGENT_Z_APP_BASE_URL and AGENT_Z_INTERNAL_SECRET must be set on the MCP service.",
    };
  }
  let response: Response;
  try {
    response = await fetch(`${baseUrl}/api/oversight/search`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify(input),
    });
  } catch (error) {
    return {
      ok: false,
      error: `Oversight search transport failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    return {
      ok: false,
      error: `Oversight search returned ${response.status}: ${text || "(no body)"}`,
    };
  }
  const json = (await response.json().catch(() => null)) as {
    hits?: SearchHit[];
    error?: string;
  } | null;
  if (!json || !Array.isArray(json.hits)) {
    return { ok: false, error: json?.error ?? "Oversight search returned an invalid payload." };
  }
  return { ok: true, hits: json.hits };
}

function formatSearchHits(query: string, hits: SearchHit[]): string {
  if (hits.length === 0) {
    return `No messages matched "${query}". The message archive may still be backfilling embeddings; try again in a minute.`;
  }
  const lines = hits.map((hit, idx) => {
    const sim = hit.similarity.toFixed(3);
    const link = hit.guildId
      ? `<https://discord.com/channels/${hit.guildId}/${hit.channelId}/${hit.id}>`
      : `<https://discord.com/channels/@me/${hit.channelId}/${hit.id}>`;
    const author = hit.authorName ? `${hit.authorName} (${hit.authorId})` : hit.authorId;
    const snippet = hit.content.length > 280 ? `${hit.content.slice(0, 277)}…` : hit.content;
    return `${idx + 1}. ${link} — ${author} at ${hit.sentAt} (sim ${sim})\n   > ${snippet.replace(/\n+/g, " ")}`;
  });
  return [
    `Top ${hits.length} match${hits.length === 1 ? "" : "es"} for "${query}":`,
    ...lines,
  ].join("\n");
}

// ---------------------------------------------------------------- find_user_messages

function formatRecentList(label: string, messages: ArchivedMessage[]): string {
  if (messages.length === 0) {
    return `${label}: nothing on file.`;
  }
  const lines = messages.map((row) => {
    const link = row.guildId
      ? `<https://discord.com/channels/${row.guildId}/${row.channelId}/${row.id}>`
      : `<https://discord.com/channels/@me/${row.channelId}/${row.id}>`;
    const author = row.authorName ? `${row.authorName} (${row.authorId})` : row.authorId;
    const snippet =
      row.content.length > 240 ? `${row.content.slice(0, 237)}…` : row.content || "(empty)";
    return `- ${link} — ${author} at ${row.sentAt.toISOString()}\n  > ${snippet.replace(/\n+/g, " ")}`;
  });
  return [`${label} (${messages.length}):`, ...lines].join("\n");
}

// ---------------------------------------------------------------- registration

export function registerOversightTools(server: McpServer): void {
  server.registerTool(
    "search_server_messages",
    {
      title: "Search the server message archive (semantic)",
      description:
        "Run a semantic search over the Oversight Layer's pgvector index. Returns the top matching messages with permalinks and similarity scores. Use this when the user asks 'when did someone discuss X', 'find that conversation about Y', or to gather context before answering an open-ended question. Filter by channel, guild, author, or time window if you can.",
      inputSchema: SearchInputSchema.shape,
    },
    async (input, ctx: McpToolContext) => {
      const actor = await requireTier(ctx, "verified");
      if (!actor) return tierError("verified");

      const result = await callSearchService(input as SearchInput);
      if (!result.ok) {
        return textResult(result.error, { isError: true });
      }
      return textResult(formatSearchHits(input.query, result.hits));
    }
  );

  server.registerTool(
    "find_user_messages",
    {
      title: "Recent messages from a specific user",
      description:
        "List the most recent messages a user has sent (newest first). Doesn't use embeddings — fast for 'what has @user posted recently' or audit-style questions. Caps at 50 per call.",
      inputSchema: {
        userId: SNOWFLAKE,
        limit: z.number().int().min(1).max(50).optional(),
        guildId: SNOWFLAKE.optional(),
      },
    },
    async (input, ctx: McpToolContext) => {
      const actor = await requireTier(ctx, "verified");
      if (!actor) return tierError("verified");

      const messages = await listUserMessages({
        userId: input.userId,
        limit: input.limit,
        guildId: input.guildId,
      });
      return textResult(formatRecentList(`Recent messages by <@${input.userId}>`, messages));
    }
  );

  server.registerTool(
    "summarize_channel_activity",
    {
      title: "Recent channel activity",
      description:
        "Pull a window of recent messages from a channel so the agent can summarize them. Returns up to 100 messages with author, timestamp, and content. The agent should produce the actual summary in its response — this tool only fetches the raw material.",
      inputSchema: {
        channelId: SNOWFLAKE,
        limit: z.number().int().min(1).max(100).optional(),
        before: z.string().datetime().optional(),
        after: z.string().datetime().optional(),
        includeDeleted: z.boolean().optional(),
      },
    },
    async (input, ctx: McpToolContext) => {
      const actor = await requireTier(ctx, "verified");
      if (!actor) return tierError("verified");

      const messages = await listChannelMessages({
        channelId: input.channelId,
        limit: input.limit,
        before: input.before ? new Date(input.before) : undefined,
        after: input.after ? new Date(input.after) : undefined,
        includeDeleted: input.includeDeleted ?? false,
      });
      return textResult(formatRecentList(`Channel <#${input.channelId}>`, messages));
    }
  );
}
