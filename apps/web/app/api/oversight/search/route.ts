/**
 * Internal "search the message archive" endpoint.
 *
 * The MCP server (apps/discord-mcp) calls this from its
 * `search_server_messages` tool. The MCP package can't talk to the AI Gateway
 * directly because we don't want to drag that client + the embedding model
 * configuration into the MCP runtime, and the embedding helper already lives
 * here. Authorization is by `AGENT_Z_INTERNAL_SECRET` bearer.
 *
 * Request body:
 *   { query: string, limit?: number, channelId?: string, guildId?: string,
 *     authorId?: string, before?: ISO, after?: ISO, includeBots?: boolean }
 *
 * Response:
 *   { hits: Array<{ id, channelId, guildId, authorId, authorName, content,
 *                   sentAt, similarity }> }
 */

import { NextResponse } from "next/server";
import { searchMessagesByEmbedding, type MessageSearchHit } from "@repo/db";
import { embedOne } from "@/lib/embeddings";

export const runtime = "nodejs";
export const maxDuration = 30;

type SearchPayload = {
  query?: unknown;
  limit?: unknown;
  channelId?: unknown;
  guildId?: unknown;
  authorId?: unknown;
  before?: unknown;
  after?: unknown;
  includeBots?: unknown;
};

export async function POST(request: Request) {
  const expected = process.env.AGENT_Z_INTERNAL_SECRET?.trim();
  if (!expected) {
    return NextResponse.json(
      { error: "AGENT_Z_INTERNAL_SECRET is not configured." },
      { status: 503 }
    );
  }
  const presented = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (presented !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: SearchPayload;
  try {
    body = (await request.json()) as SearchPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const query = typeof body.query === "string" ? body.query.trim() : "";
  if (!query) {
    return NextResponse.json({ error: "Missing `query`." }, { status: 400 });
  }

  let vector: number[];
  try {
    const result = await embedOne(query);
    vector = result.vector;
  } catch (error) {
    console.error("[oversight/search] embed failed", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not generate query embedding.",
      },
      { status: 502 }
    );
  }

  const hits: MessageSearchHit[] = await searchMessagesByEmbedding({
    embedding: vector,
    limit: typeof body.limit === "number" ? body.limit : undefined,
    channelId: typeof body.channelId === "string" ? body.channelId : undefined,
    guildId: typeof body.guildId === "string" ? body.guildId : undefined,
    authorId: typeof body.authorId === "string" ? body.authorId : undefined,
    before: typeof body.before === "string" ? new Date(body.before) : undefined,
    after: typeof body.after === "string" ? new Date(body.after) : undefined,
    includeBots: Boolean(body.includeBots),
  });

  return NextResponse.json({ hits: hits.map(serialize) });
}

function serialize(hit: MessageSearchHit) {
  return {
    id: hit.id,
    channelId: hit.channelId,
    guildId: hit.guildId,
    authorId: hit.authorId,
    authorName: hit.authorName,
    content: hit.content,
    sentAt: hit.sentAt.toISOString(),
    similarity: hit.similarity,
  };
}
