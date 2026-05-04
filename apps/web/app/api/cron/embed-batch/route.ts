/**
 * Embed-batch cron worker.
 *
 * Drains up to 50 message ids from the Redis Streams embed queue, fetches
 * their content from Postgres, batches a single AI Gateway embedMany call,
 * writes the embeddings back, and acks the entries. If anything fails for
 * an entry, it stays un-acked so the next pass retries via XAUTOCLAIM.
 *
 * Also runs a small backfill pass against `listPendingEmbedIds` so messages
 * that never made it onto the stream (e.g. enqueue failed) eventually catch
 * up.
 *
 * Schedule: see apps/web/vercel.json (daily on Hobby; Pro allows tighter cadence).
 * Vercel cron requests include the `x-vercel-cron` header; we rely on that to gate the route.
 */

import { NextResponse } from "next/server";
import {
  ackEmbedIds,
  claimEmbedBatch,
  getArchivedMessage,
  listPendingEmbedIds,
  persistMessageEmbedding,
  type EmbedJob,
} from "@repo/db";
import { embedManyTexts, prepareForEmbedding } from "@/lib/embeddings";

export const runtime = "nodejs";
export const maxDuration = 60;

const BATCH_SIZE = 50;
const BACKFILL_SIZE = 25;

export async function GET(request: Request) {
  const isVercelCron = request.headers.get("x-vercel-cron")?.trim() === "1";
  const presentedSecret = request.headers.get("x-cron-secret")?.trim();
  const expectedSecret = process.env.AGENT_Z_INTERNAL_SECRET?.trim();
  if (!isVercelCron && presentedSecret !== expectedSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const consumerId = `cron-${Date.now().toString(36)}`;

  const [streamProcessed, streamFailed, streamAcked] = await processStream(consumerId);
  const backfillProcessed = await processBackfill();

  return NextResponse.json({
    ok: true,
    consumerId,
    stream: {
      processed: streamProcessed,
      failed: streamFailed,
      acked: streamAcked,
    },
    backfill: { processed: backfillProcessed },
  });
}

async function processStream(consumerId: string): Promise<[number, number, number]> {
  let jobs: EmbedJob[] = [];
  try {
    jobs = await claimEmbedBatch({ consumerId, count: BATCH_SIZE });
  } catch (error) {
    console.error("[embed-batch] claim failed", error);
    return [0, 0, 0];
  }
  if (jobs.length === 0) return [0, 0, 0];

  // Deduplicate (a message may have been re-queued by an edit).
  const byMessageId = new Map<string, EmbedJob[]>();
  for (const job of jobs) {
    const arr = byMessageId.get(job.messageId);
    if (arr) arr.push(job);
    else byMessageId.set(job.messageId, [job]);
  }

  const messageIds = Array.from(byMessageId.keys());
  const records = await Promise.all(
    messageIds.map(async (id) => ({ id, row: await getArchivedMessage(id).catch(() => null) }))
  );

  const ackable: string[] = [];
  const toEmbed: Array<{ id: string; text: string }> = [];

  for (const { id, row } of records) {
    const entries = byMessageId.get(id) ?? [];
    if (!row || row.deletedAt || !row.content?.trim()) {
      // Nothing to embed — ack the queue entries and move on.
      for (const e of entries) ackable.push(e.entryId);
      continue;
    }
    toEmbed.push({ id, text: prepareForEmbedding(row.content) });
  }

  let processed = 0;
  let failed = 0;
  if (toEmbed.length > 0) {
    try {
      const { vectors, model } = await embedManyTexts(toEmbed.map((t) => t.text));
      for (let i = 0; i < toEmbed.length; i += 1) {
        const item = toEmbed[i];
        const vector = vectors[i];
        if (!vector || vector.length === 0) continue;
        try {
          await persistMessageEmbedding({ id: item.id, embedding: vector, model });
          processed += 1;
          for (const e of byMessageId.get(item.id) ?? []) ackable.push(e.entryId);
        } catch (error) {
          console.error("[embed-batch] persist failed", item.id, error);
          failed += 1;
        }
      }
    } catch (error) {
      console.error("[embed-batch] embedMany failed", error);
      failed += toEmbed.length;
    }
  }

  if (ackable.length > 0) {
    await ackEmbedIds(ackable);
  }

  return [processed, failed, ackable.length];
}

async function processBackfill(): Promise<number> {
  let ids: string[];
  try {
    ids = await listPendingEmbedIds(BACKFILL_SIZE);
  } catch (error) {
    console.error("[embed-batch] backfill list failed", error);
    return 0;
  }
  if (ids.length === 0) return 0;

  const records = await Promise.all(ids.map((id) => getArchivedMessage(id).catch(() => null)));
  const toEmbed = records
    .filter((row): row is NonNullable<typeof row> => Boolean(row && !row.deletedAt && row.content.trim()))
    .map((row) => ({ id: row.id, text: prepareForEmbedding(row.content) }));
  if (toEmbed.length === 0) return 0;

  try {
    const { vectors, model } = await embedManyTexts(toEmbed.map((t) => t.text));
    let processed = 0;
    for (let i = 0; i < toEmbed.length; i += 1) {
      const vector = vectors[i];
      if (!vector || vector.length === 0) continue;
      try {
        await persistMessageEmbedding({ id: toEmbed[i].id, embedding: vector, model });
        processed += 1;
      } catch (error) {
        console.error("[embed-batch] backfill persist failed", toEmbed[i].id, error);
      }
    }
    return processed;
  } catch (error) {
    console.error("[embed-batch] backfill embedMany failed", error);
    return 0;
  }
}
