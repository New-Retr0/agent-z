import { Prisma } from "@prisma/client";
import { prisma } from "./client";

/**
 * Persistent memory primitives used by the agent runner and the MCP
 * `remember_about_user` / `forget_about_user` / `/forget-me` tools.
 *
 * All functions in this module are safe to call from serverless handlers;
 * they use the shared Prisma client and never open their own connections.
 */

// ---------------------------------------------------------------- ConversationTurn

export type ConversationRole = "user" | "assistant" | "system" | "tool";

export interface RecordTurnInput {
  channelId: string;
  userId: string;
  role: ConversationRole;
  content: string;
  toolCalls?: unknown;
  modelId?: string;
  agentRunId?: string;
}

export async function recordConversationTurn(
  input: RecordTurnInput,
): Promise<void> {
  await prisma.conversationTurn.create({
    data: {
      channelId: input.channelId,
      userId: input.userId,
      role: input.role,
      content: input.content,
      toolCalls: (input.toolCalls ?? Prisma.JsonNull) as Prisma.InputJsonValue,
      modelId: input.modelId ?? null,
      agentRunId: input.agentRunId ?? null,
    },
  });
}

export interface RecentTurnsOptions {
  channelId: string;
  /** Default 12 — gives ~6 round trips of context without blowing prompt budget. */
  limit?: number;
}

export interface RecentTurn {
  id: string;
  role: ConversationRole;
  content: string;
  userId: string;
  createdAt: Date;
}

/**
 * Returns the most recent N turns in chronological order (oldest first).
 * Consumed by `runAgentZ` as structured chat messages (`messages`), not embedded logs.
 */
export async function loadRecentTurns(
  options: RecentTurnsOptions,
): Promise<RecentTurn[]> {
  const limit = options.limit ?? 12;
  const rows = await prisma.conversationTurn.findMany({
    where: { channelId: options.channelId },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      role: true,
      content: true,
      userId: true,
      createdAt: true,
    },
  });
  return rows.reverse().map((r) => ({
    id: r.id,
    role: r.role as ConversationRole,
    content: r.content,
    userId: r.userId,
    createdAt: r.createdAt,
  }));
}

// ---------------------------------------------------------------- UserProfile

export interface ProfileNote {
  text: string;
  /** ISO timestamp the note was added. */
  at: string;
  /** Free-form short label for filtering ("preference", "context", "fact"). */
  kind?: string;
}

export interface UserProfileSnapshot {
  userId: string;
  displayName: string | null;
  notes: ProfileNote[];
  preferences: Record<string, unknown>;
  lastSeenAt: Date | null;
  updatedAt: Date;
  createdAt: Date;
}

function deserializeProfile(
  row: NonNullable<Awaited<ReturnType<typeof prisma.userProfile.findUnique>>>,
): UserProfileSnapshot {
  const notes = Array.isArray(row.notesJson)
    ? (row.notesJson as unknown as ProfileNote[])
    : [];
  const preferences =
    row.preferencesJson && typeof row.preferencesJson === "object"
      ? (row.preferencesJson as Record<string, unknown>)
      : {};
  return {
    userId: row.userId,
    displayName: row.displayName,
    notes,
    preferences,
    lastSeenAt: row.lastSeenAt,
    updatedAt: row.updatedAt,
    createdAt: row.createdAt,
  };
}

export async function loadUserProfile(
  userId: string,
): Promise<UserProfileSnapshot | null> {
  const row = await prisma.userProfile.findUnique({ where: { userId } });
  return row ? deserializeProfile(row) : null;
}

export async function loadUserProfilesBulk(
  userIds: string[],
): Promise<Map<string, UserProfileSnapshot>> {
  if (userIds.length === 0) return new Map();
  const unique = Array.from(new Set(userIds));
  const rows = await prisma.userProfile.findMany({
    where: { userId: { in: unique } },
  });
  const out = new Map<string, UserProfileSnapshot>();
  for (const r of rows) out.set(r.userId, deserializeProfile(r));
  return out;
}

export interface RememberAboutUserInput {
  userId: string;
  displayName?: string;
  note?: ProfileNote | string;
  /** Shallow-merged into the existing preferences blob. */
  preferences?: Record<string, unknown>;
  /** Defaults to current time. Pass `null` to skip the touch. */
  lastSeenAt?: Date | null;
  /** Hard cap to prevent unbounded growth from a runaway agent. Default 200. */
  maxNotes?: number;
}

export async function rememberAboutUser(
  input: RememberAboutUserInput,
): Promise<UserProfileSnapshot> {
  const maxNotes = input.maxNotes ?? 200;
  const note: ProfileNote | null =
    typeof input.note === "string"
      ? { text: input.note, at: new Date().toISOString() }
      : input.note ?? null;

  const existing = await prisma.userProfile.findUnique({
    where: { userId: input.userId },
  });

  const previousNotes: ProfileNote[] =
    existing && Array.isArray(existing.notesJson)
      ? (existing.notesJson as unknown as ProfileNote[])
      : [];
  const previousPrefs: Record<string, unknown> =
    existing && existing.preferencesJson && typeof existing.preferencesJson === "object"
      ? (existing.preferencesJson as Record<string, unknown>)
      : {};

  const nextNotes = note
    ? [...previousNotes, note].slice(-maxNotes)
    : previousNotes;
  const nextPrefs = input.preferences
    ? { ...previousPrefs, ...input.preferences }
    : previousPrefs;
  const nextLastSeen =
    input.lastSeenAt === null
      ? existing?.lastSeenAt ?? null
      : input.lastSeenAt ?? new Date();

  const upserted = await prisma.userProfile.upsert({
    where: { userId: input.userId },
    create: {
      userId: input.userId,
      displayName: input.displayName ?? null,
      notesJson: nextNotes as unknown as Prisma.InputJsonValue,
      preferencesJson: nextPrefs as unknown as Prisma.InputJsonValue,
      lastSeenAt: nextLastSeen,
    },
    update: {
      displayName: input.displayName ?? existing?.displayName ?? null,
      notesJson: nextNotes as unknown as Prisma.InputJsonValue,
      preferencesJson: nextPrefs as unknown as Prisma.InputJsonValue,
      lastSeenAt: nextLastSeen,
    },
  });

  return deserializeProfile(upserted);
}

// ---------------------------------------------------------------- Forget flows

export interface ForgetUserResult {
  userId: string;
  conversationTurnsDeleted: number;
  profileDeleted: boolean;
  scheduledMessagesCancelled: number;
}

/**
 * Hard-deletes every row tied to a user across the memory tables.
 * Used by `/forget-me` (self-service) and the admin `forget_about_user` tool.
 *
 * Note: the server-wide message archive (`Message` table) is handled in a
 * separate phase; this function only covers Phase 3 surfaces.
 */
export async function forgetUser(userId: string): Promise<ForgetUserResult> {
  return prisma.$transaction(async (tx) => {
    const turnDelete = await tx.conversationTurn.deleteMany({
      where: { userId },
    });
    const profileDelete = await tx.userProfile.deleteMany({
      where: { userId },
    });
    const scheduledCancel = await tx.scheduledMessage.updateMany({
      where: { authorUserId: userId, status: "pending" },
      data: { status: "cancelled", lastError: "forget_user" },
    });
    return {
      userId,
      conversationTurnsDeleted: turnDelete.count,
      profileDeleted: profileDelete.count > 0,
      scheduledMessagesCancelled: scheduledCancel.count,
    };
  });
}

// ---------------------------------------------------------------- ScheduledMessage

export interface EnqueueScheduledMessageInput {
  channelId: string;
  guildId?: string;
  scheduledFor: Date;
  content: string;
  components?: unknown;
  authorUserId: string;
  targetUserIds?: string[];
}

export async function enqueueScheduledMessage(
  input: EnqueueScheduledMessageInput,
): Promise<{ id: string; scheduledFor: Date }> {
  const row = await prisma.scheduledMessage.create({
    data: {
      channelId: input.channelId,
      guildId: input.guildId ?? null,
      scheduledFor: input.scheduledFor,
      content: input.content,
      components: (input.components ?? Prisma.JsonNull) as Prisma.InputJsonValue,
      authorUserId: input.authorUserId,
      targetUserIds: input.targetUserIds ?? [],
    },
    select: { id: true, scheduledFor: true },
  });
  return row;
}

export async function cancelScheduledMessage(
  id: string,
  byUserId: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const row = await prisma.scheduledMessage.findUnique({ where: { id } });
  if (!row) return { ok: false, reason: "not_found" };
  if (row.status !== "pending") {
    return { ok: false, reason: `already ${row.status}` };
  }
  await prisma.scheduledMessage.update({
    where: { id },
    data: { status: "cancelled", lastError: `cancelled_by:${byUserId}` },
  });
  return { ok: true };
}

export async function claimDueScheduledMessages(
  limit = 25,
  now: Date = new Date(),
) {
  // Two-step claim so we don't double-deliver across overlapping cron ticks.
  const due = await prisma.scheduledMessage.findMany({
    where: { status: "pending", scheduledFor: { lte: now } },
    orderBy: { scheduledFor: "asc" },
    take: limit,
    select: { id: true },
  });
  if (due.length === 0) return [];
  const ids = due.map((d) => d.id);
  const claimed = await prisma.scheduledMessage.updateMany({
    where: { id: { in: ids }, status: "pending" },
    data: { status: "claimed" },
  });
  if (claimed.count === 0) return [];
  return prisma.scheduledMessage.findMany({
    where: { id: { in: ids }, status: "claimed" },
  });
}

// ---------------------------------------------------------------- VerificationGrant

export interface RecordVerificationGrantInput {
  userId: string;
  guildId: string;
  roleId: string;
  reactionMessageId?: string;
  reactionEmoji?: string;
}

export async function recordVerificationGrant(
  input: RecordVerificationGrantInput,
): Promise<void> {
  await prisma.verificationGrant.upsert({
    where: {
      userId_guildId_roleId: {
        userId: input.userId,
        guildId: input.guildId,
        roleId: input.roleId,
      },
    },
    create: {
      userId: input.userId,
      guildId: input.guildId,
      roleId: input.roleId,
      reactionMessageId: input.reactionMessageId ?? null,
      reactionEmoji: input.reactionEmoji ?? null,
    },
    update: {
      reactionMessageId: input.reactionMessageId ?? null,
      reactionEmoji: input.reactionEmoji ?? null,
      revokedAt: null,
      revokedReason: null,
    },
  });
}

export async function revokeVerificationGrant(
  userId: string,
  guildId: string,
  roleId: string,
  reason: string,
): Promise<void> {
  await prisma.verificationGrant.updateMany({
    where: { userId, guildId, roleId, revokedAt: null },
    data: { revokedAt: new Date(), revokedReason: reason },
  });
}
