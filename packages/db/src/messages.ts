/**
 * Typed accessors for the Discord message archive (the "Oversight Layer").
 *
 * The Message table stores every Discord MESSAGE_CREATE event the gateway
 * forwards plus its lifecycle (edits, deletes). Embeddings populate
 * asynchronously via the Redis Streams queue + /api/cron/embed-batch.
 *
 * The `embedding` column is pgvector(1536); we read/write it through raw SQL
 * (`$queryRawUnsafe` / `$executeRawUnsafe`) because Prisma doesn't natively
 * support the type. The other columns are accessed through the typed client.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "./client";

export type MessageAttachment = {
  id?: string;
  filename?: string;
  url?: string;
  content_type?: string;
  size?: number;
};

export type IncomingMessage = {
  id: string;
  channelId: string;
  guildId: string | null;
  authorId: string;
  authorName: string | null;
  authorIsBot: boolean;
  content: string;
  referencedMessageId: string | null;
  attachments: MessageAttachment[];
  mentionUserIds: string[];
  sentAt: Date;
};

export type ArchivedMessage = {
  id: string;
  channelId: string;
  guildId: string | null;
  authorId: string;
  authorName: string | null;
  authorIsBot: boolean;
  content: string;
  referencedMessageId: string | null;
  attachments: MessageAttachment[];
  mentionUserIds: string[];
  sentAt: Date;
  editedAt: Date | null;
  deletedAt: Date | null;
};

export type MessageSearchHit = {
  id: string;
  channelId: string;
  guildId: string | null;
  authorId: string;
  authorName: string | null;
  content: string;
  sentAt: Date;
  similarity: number;
};

/**
 * Idempotently upsert an incoming Discord message into the archive. Edits are
 * tracked separately via `markEdited`; this function only writes on initial
 * insertion. Returns true if the message was newly inserted (caller should
 * enqueue an embed job).
 */
export async function upsertIncomingMessage(message: IncomingMessage): Promise<boolean> {
  const result = await prisma.message.upsert({
    where: { id: message.id },
    create: {
      id: message.id,
      channelId: message.channelId,
      guildId: message.guildId,
      authorId: message.authorId,
      authorName: message.authorName,
      authorIsBot: message.authorIsBot,
      content: message.content,
      referencedMessageId: message.referencedMessageId,
      attachments: message.attachments as unknown as Prisma.InputJsonValue,
      mentionUserIds: message.mentionUserIds,
      sentAt: message.sentAt,
    },
    update: {},
    select: { createdAt: true, embeddedAt: true, editedAt: true },
  });
  // If createdAt is within the last second, treat this as a new insert.
  return Date.now() - result.createdAt.getTime() < 1500;
}

export async function markMessageEdited(args: {
  id: string;
  content: string;
  editedAt: Date;
}): Promise<void> {
  // Update the typed columns through Prisma, then clear the pgvector column
  // via raw SQL since `embedding` is not declared in the Prisma model.
  try {
    await prisma.message.update({
      where: { id: args.id },
      data: {
        content: args.content,
        editedAt: args.editedAt,
        embeddedAt: null,
        embeddingModel: null,
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      // Edited a message we never saw — ignore.
      return;
    }
    throw error;
  }
  await prisma.$executeRawUnsafe(
    `UPDATE "message" SET "embedding" = NULL WHERE "id" = $1`,
    args.id
  );
}

export async function markMessageDeleted(args: { id: string; deletedAt: Date }): Promise<void> {
  await prisma.message
    .update({
      where: { id: args.id },
      data: { deletedAt: args.deletedAt },
    })
    .catch((error: unknown) => {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
        return;
      }
      throw error;
    });
}

export async function getArchivedMessage(id: string): Promise<ArchivedMessage | null> {
  const row = await prisma.message.findUnique({ where: { id } });
  if (!row) return null;
  return mapRow(row);
}

export async function listChannelMessages(args: {
  channelId: string;
  limit?: number;
  before?: Date;
  after?: Date;
  includeDeleted?: boolean;
}): Promise<ArchivedMessage[]> {
  const limit = Math.min(Math.max(args.limit ?? 50, 1), 200);
  const rows = await prisma.message.findMany({
    where: {
      channelId: args.channelId,
      ...(args.before ? { sentAt: { lt: args.before } } : {}),
      ...(args.after ? { sentAt: { gt: args.after } } : {}),
      ...(args.includeDeleted ? {} : { deletedAt: null }),
    },
    orderBy: { sentAt: "desc" },
    take: limit,
  });
  return rows.map(mapRow).reverse();
}

export async function listUserMessages(args: {
  userId: string;
  limit?: number;
  guildId?: string;
}): Promise<ArchivedMessage[]> {
  const limit = Math.min(Math.max(args.limit ?? 50, 1), 200);
  const rows = await prisma.message.findMany({
    where: {
      authorId: args.userId,
      ...(args.guildId ? { guildId: args.guildId } : {}),
      deletedAt: null,
    },
    orderBy: { sentAt: "desc" },
    take: limit,
  });
  return rows.map(mapRow);
}

/**
 * Returns up to N message ids that have content but no embedding yet, oldest
 * first. Used as a backfill safety net by the embed-batch worker (the primary
 * driver is the Redis Streams queue).
 */
export async function listPendingEmbedIds(limit: number = 200): Promise<string[]> {
  const rows = await prisma.message.findMany({
    where: {
      embeddedAt: null,
      content: { not: "" },
      deletedAt: null,
    },
    orderBy: { sentAt: "asc" },
    take: limit,
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

/**
 * Persist a freshly computed embedding for a message. Skips writing if the row
 * has been edited since (the next backfill pass will pick it up with the new
 * content).
 */
export async function persistMessageEmbedding(args: {
  id: string;
  embedding: number[];
  model: string;
}): Promise<void> {
  if (args.embedding.length === 0) return;
  // pgvector accepts the literal "[0.1,0.2,...]" cast to vector.
  const literal = `[${args.embedding.join(",")}]`;
  await prisma.$executeRawUnsafe(
    `UPDATE "message"
       SET "embedding" = $1::vector,
           "embedding_model" = $2,
           "embedded_at" = NOW()
       WHERE "id" = $3`,
    literal,
    args.model,
    args.id
  );
}

/**
 * Bulk variant for the embed-batch cron. Uses a single round-trip with VALUES.
 */
export async function persistMessageEmbeddingsBulk(
  rows: Array<{ id: string; embedding: number[]; model: string }>
): Promise<number> {
  if (rows.length === 0) return 0;
  let updated = 0;
  for (const row of rows) {
    if (row.embedding.length === 0) continue;
    await persistMessageEmbedding(row);
    updated += 1;
  }
  return updated;
}

/**
 * HNSW cosine search. Returns rows with similarity = (1 - cosine_distance), so
 * 1.0 is exact match and 0.0 is opposite. Caller should provide a threshold
 * around 0.6–0.75 depending on the use case.
 */
export async function searchMessagesByEmbedding(args: {
  embedding: number[];
  limit?: number;
  channelId?: string;
  guildId?: string;
  authorId?: string;
  before?: Date;
  after?: Date;
  includeBots?: boolean;
}): Promise<MessageSearchHit[]> {
  const limit = Math.min(Math.max(args.limit ?? 20, 1), 100);
  const literal = `[${args.embedding.join(",")}]`;

  const whereClauses: string[] = [
    `"embedding" IS NOT NULL`,
    `"deleted_at" IS NULL`,
  ];
  const params: unknown[] = [literal];
  let paramIdx = 2;
  if (args.channelId) {
    whereClauses.push(`"channel_id" = $${paramIdx++}`);
    params.push(args.channelId);
  }
  if (args.guildId) {
    whereClauses.push(`"guild_id" = $${paramIdx++}`);
    params.push(args.guildId);
  }
  if (args.authorId) {
    whereClauses.push(`"author_id" = $${paramIdx++}`);
    params.push(args.authorId);
  }
  if (args.before) {
    whereClauses.push(`"sent_at" < $${paramIdx++}`);
    params.push(args.before);
  }
  if (args.after) {
    whereClauses.push(`"sent_at" > $${paramIdx++}`);
    params.push(args.after);
  }
  if (!args.includeBots) {
    whereClauses.push(`"author_is_bot" = false`);
  }

  const sql = `
    SELECT
      "id", "channel_id", "guild_id", "author_id", "author_name", "content", "sent_at",
      1 - ("embedding" <=> $1::vector) AS similarity
    FROM "message"
    WHERE ${whereClauses.join(" AND ")}
    ORDER BY "embedding" <=> $1::vector
    LIMIT ${limit}
  `;

  const rows = await prisma.$queryRawUnsafe<
    Array<{
      id: string;
      channel_id: string;
      guild_id: string | null;
      author_id: string;
      author_name: string | null;
      content: string;
      sent_at: Date;
      similarity: number;
    }>
  >(sql, ...params);

  return rows.map((row) => ({
    id: row.id,
    channelId: row.channel_id,
    guildId: row.guild_id,
    authorId: row.author_id,
    authorName: row.author_name,
    content: row.content,
    sentAt: row.sent_at,
    similarity: Number(row.similarity),
  }));
}

/**
 * Convenience metric for the admin dashboard.
 */
export async function getOversightStats(): Promise<{
  total: number;
  embedded: number;
  pending: number;
  oldestPending: Date | null;
}> {
  const [total, embedded, oldest] = await Promise.all([
    prisma.message.count({ where: { deletedAt: null } }),
    prisma.message.count({ where: { embeddedAt: { not: null }, deletedAt: null } }),
    prisma.message.findFirst({
      where: { embeddedAt: null, content: { not: "" }, deletedAt: null },
      orderBy: { sentAt: "asc" },
      select: { sentAt: true },
    }),
  ]);
  return {
    total,
    embedded,
    pending: total - embedded,
    oldestPending: oldest?.sentAt ?? null,
  };
}

function mapRow(row: {
  id: string;
  channelId: string;
  guildId: string | null;
  authorId: string;
  authorName: string | null;
  authorIsBot: boolean;
  content: string;
  referencedMessageId: string | null;
  attachments: Prisma.JsonValue;
  mentionUserIds: string[];
  sentAt: Date;
  editedAt: Date | null;
  deletedAt: Date | null;
}): ArchivedMessage {
  return {
    id: row.id,
    channelId: row.channelId,
    guildId: row.guildId,
    authorId: row.authorId,
    authorName: row.authorName,
    authorIsBot: row.authorIsBot,
    content: row.content,
    referencedMessageId: row.referencedMessageId,
    attachments: Array.isArray(row.attachments) ? (row.attachments as MessageAttachment[]) : [],
    mentionUserIds: row.mentionUserIds,
    sentAt: row.sentAt,
    editedAt: row.editedAt,
    deletedAt: row.deletedAt,
  };
}
