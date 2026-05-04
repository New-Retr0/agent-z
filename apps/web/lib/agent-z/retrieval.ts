import { createHash } from "node:crypto";
import { Redis } from "@upstash/redis";
import { searchMessagesByEmbedding } from "@repo/db";
import { embedOne } from "@/lib/embeddings";

export type OversightRecallHit = {
  id: string;
  channelId: string;
  excerpt: string;
  similarity: number;
  sentAt: string;
};

const CACHE_TTL_SEC = 60;
const SNIPPET_CHARS = 140;
const SIM_THRESHOLD = 0.52;

function redisOptional(): Redis | null {
  try {
    const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
    if (!url?.trim() || !token?.trim()) return null;
    return new Redis({ url: url.trim(), token: token.trim() });
  } catch {
    return null;
  }
}

function cacheKey(query: string, channelId: string | null | undefined, guildId: string | null | undefined): string {
  const raw = `${query}|${channelId ?? ""}|${guildId ?? ""}`;
  const h = createHash("sha256").update(raw).digest("hex").slice(0, 32);
  return `agent-z:recall:${h}`;
}

/** Gate cheap noise — archive recall runs only when true (plan default). */
export function shouldRunSemanticRecall(userPrompt: string): boolean {
  const t = userPrompt.trim();
  if (t.length < 8) return false;
  const lower = t.toLowerCase();
  if (lower === "help" || lower.startsWith("/help")) return false;
  return true;
}

function excerpt(content: string): string {
  const c = content.replace(/\s+/g, " ").trim();
  if (c.length <= SNIPPET_CHARS) return c;
  return `${c.slice(0, SNIPPET_CHARS)}…`;
}

/**
 * Embed query + cosine search Oversight archive (pgvector). Scoped by channel/guild when provided.
 */
export async function retrieveOversightSnippets(args: {
  query: string;
  channelId?: string | null;
  guildId?: string | null;
  limit?: number;
}): Promise<OversightRecallHit[]> {
  const limit = Math.min(Math.max(args.limit ?? 6, 1), 12);
  const q = args.query.trim();
  if (!q) return [];

  const redis = redisOptional();
  const key = cacheKey(q, args.channelId, args.guildId);
  if (redis) {
    try {
      const cached = await redis.get<string>(key);
      if (cached) {
        const parsed = JSON.parse(cached) as OversightRecallHit[];
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      // ignore cache parse errors
    }
  }

  let embedding: number[];
  try {
    const out = await embedOne(q);
    embedding = out.vector;
  } catch {
    return [];
  }

  const hits = await searchMessagesByEmbedding({
    embedding,
    limit,
    channelId: args.channelId ?? undefined,
    guildId: args.guildId ?? undefined,
    includeBots: false,
  });

  const filtered = hits.filter((h) => h.similarity >= SIM_THRESHOLD);

  const mapped: OversightRecallHit[] = filtered.map((h) => ({
    id: h.id,
    channelId: h.channelId,
    excerpt: excerpt(h.content),
    similarity: h.similarity,
    sentAt: h.sentAt.toISOString(),
  }));

  if (redis && mapped.length > 0) {
    try {
      await redis.set(key, JSON.stringify(mapped), { ex: CACHE_TTL_SEC });
    } catch {
      // ignore cache write errors
    }
  }

  return mapped;
}

export function formatRecallBlock(hits: OversightRecallHit[]): string {
  if (hits.length === 0) return "";
  const lines = hits.map(
    (h, i) =>
      `${i + 1}. sim=${h.similarity.toFixed(2)} ch=${h.channelId} msg=${h.id} @ ${h.sentAt}\n   ${h.excerpt}`
  );
  return `[Oversight archive snippets — similarity-ranked; verify with tools if critical]\n${lines.join("\n")}`;
}
