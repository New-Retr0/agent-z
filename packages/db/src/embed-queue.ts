/**
 * Redis Streams queue used by the Oversight Layer to fan out embedding work.
 *
 * - The Discord webhook (`/api/discord/oversight`) calls `enqueueEmbed` after a
 *   successful upsert into the message archive. This is fire-and-forget and
 *   bounded by `MAXLEN ~ <cap>` so traffic spikes can't unbound-grow the queue.
 * - The cron worker (`/api/cron/embed-batch`) calls `claimEmbedBatch` to pull a
 *   batch via XREADGROUP, generates embeddings for each, persists them, then
 *   acks via `ackEmbedIds`. Anything that fails an embed call is left
 *   un-acked so the next pass retries it (PEL semantics).
 *
 * The Upstash REST client is HTTP-based and stateless; safe to instantiate at
 * module scope and reuse across edge / serverless invocations.
 */

import { Redis } from "@upstash/redis";

const STREAM_KEY = "agent-z:oversight:embed-queue";
const CONSUMER_GROUP = "embed-batch";
// Soft cap on queue length. Upstash trims approximately to this value via
// MAXLEN ~ during XADD. Plenty of headroom for typical Discord traffic.
const STREAM_MAXLEN = 100_000;

let cachedRedis: Redis | null = null;
let groupEnsured = false;

function getRedis(): Redis {
  if (cachedRedis) return cachedRedis;
  const url = process.env.KV_REST_API_URL?.trim();
  const token = process.env.KV_REST_API_TOKEN?.trim();
  if (!url || !token) {
    throw new Error(
      "[embed-queue] KV_REST_API_URL and KV_REST_API_TOKEN must be set (Upstash for Redis integration)."
    );
  }
  cachedRedis = new Redis({ url, token });
  return cachedRedis;
}

/**
 * Lazily create the consumer group. Idempotent: ignores BUSYGROUP errors.
 */
async function ensureGroup(redis: Redis): Promise<void> {
  if (groupEnsured) return;
  try {
    // MKSTREAM creates the stream if it doesn't yet exist.
    await redis.xgroup(STREAM_KEY, {
      type: "CREATE",
      group: CONSUMER_GROUP,
      id: "$",
      options: { MKSTREAM: true },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (!msg.includes("BUSYGROUP")) {
      console.error("[embed-queue] xgroup CREATE failed:", msg);
      // Don't cache failure — let the next call retry.
      return;
    }
  }
  groupEnsured = true;
}

/**
 * Push a message id onto the embed queue. Best-effort: errors are swallowed
 * with a warning so the ingest path never fails because of Redis. The cron
 * backfill (`listPendingEmbedIds`) is the safety net.
 */
export async function enqueueEmbed(messageId: string): Promise<void> {
  if (!messageId) return;
  try {
    const redis = getRedis();
    await ensureGroup(redis);
    await redis.xadd(
      STREAM_KEY,
      "*",
      { messageId },
      { trim: { type: "MAXLEN", threshold: STREAM_MAXLEN, comparison: "~" } }
    );
  } catch (error) {
    console.warn("[embed-queue] enqueue failed (will rely on cron backfill):", error);
  }
}

export type EmbedJob = {
  /** Stream entry id, used to XACK after success. */
  entryId: string;
  messageId: string;
};

/**
 * Pull up to `count` jobs for processing. Uses XREADGROUP with NOACK off so
 * the entries enter the pending list and we can retry them if processing
 * fails. `consumerId` should be unique per cron invocation (we use the
 * function execution id when available, otherwise a per-process default).
 */
export async function claimEmbedBatch(args: {
  consumerId: string;
  count: number;
  blockMs?: number;
}): Promise<EmbedJob[]> {
  const redis = getRedis();
  await ensureGroup(redis);

  // First, try to recover messages that were claimed by previous consumers
  // but never acked. XAUTOCLAIM moves any pending entry idle longer than
  // `minIdleMs` over to us.
  const reclaimed = await reclaimPending(redis, args.consumerId, args.count);
  if (reclaimed.length >= args.count) {
    return reclaimed.slice(0, args.count);
  }

  const remaining = args.count - reclaimed.length;
  const fresh = await readNewEntries(redis, args.consumerId, remaining, args.blockMs ?? 0);
  return [...reclaimed, ...fresh];
}

async function readNewEntries(
  redis: Redis,
  consumerId: string,
  count: number,
  blockMs: number
): Promise<EmbedJob[]> {
  try {
    const result = (await redis.xreadgroup(
      CONSUMER_GROUP,
      consumerId,
      STREAM_KEY,
      ">",
      { count, blockMS: blockMs }
    )) as Array<[string, Array<[string, Record<string, string>]>]> | null;

    if (!result || result.length === 0) return [];
    const stream = result[0];
    if (!stream || stream.length < 2) return [];
    const entries = stream[1];
    return entries
      .map(([entryId, fields]) => ({ entryId, messageId: fields?.messageId ?? "" }))
      .filter((job) => job.messageId);
  } catch (error) {
    console.warn("[embed-queue] xreadgroup failed:", error);
    return [];
  }
}

async function reclaimPending(
  redis: Redis,
  consumerId: string,
  count: number
): Promise<EmbedJob[]> {
  try {
    // Reclaim entries idle for >5 minutes — long enough that we're confident
    // the previous consumer is gone.
    const result = (await redis.xautoclaim(
      STREAM_KEY,
      CONSUMER_GROUP,
      consumerId,
      5 * 60_000,
      "0",
      { count }
    )) as
      | { nextCursor: string; messages: Array<[string, Record<string, string>]> }
      | Array<unknown>
      | null;

    if (!result) return [];
    // Upstash returns either the typed object or a tuple depending on version.
    const messages = Array.isArray(result)
      ? ((result[1] as Array<[string, Record<string, string>]>) ?? [])
      : (result.messages ?? []);
    return messages
      .map(([entryId, fields]) => ({ entryId, messageId: fields?.messageId ?? "" }))
      .filter((job) => job.messageId);
  } catch (error) {
    // XAUTOCLAIM is relatively new; tolerate missing support gracefully.
    console.warn("[embed-queue] xautoclaim unavailable, skipping reclaim:", error);
    return [];
  }
}

export async function ackEmbedIds(entryIds: string[]): Promise<void> {
  if (entryIds.length === 0) return;
  try {
    const redis = getRedis();
    await redis.xack(STREAM_KEY, CONSUMER_GROUP, entryIds);
  } catch (error) {
    console.warn("[embed-queue] xack failed:", error);
  }
}

/**
 * Gauge for the admin dashboard. Returns approximate stream length.
 */
export async function getEmbedQueueDepth(): Promise<number> {
  try {
    const redis = getRedis();
    const len = await redis.xlen(STREAM_KEY);
    return typeof len === "number" ? len : 0;
  } catch {
    return 0;
  }
}
