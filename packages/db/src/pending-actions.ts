import { prisma } from "./client";

export type PendingActionStatus = "pending" | "executed" | "cancelled" | "expired" | "failed";

export type CreatePendingActionInput = {
  token: string;
  invokerUserId: string;
  guildId: string | null;
  channelId: string | null;
  capability: string;
  inputJson: string;
  summary: string;
  expiresAt: Date;
  interactionToken?: string | null;
  interactionApplicationId?: string | null;
};

export async function createPendingAction(input: CreatePendingActionInput) {
  return prisma.pendingAction.create({
    data: {
      token: input.token,
      invokerUserId: input.invokerUserId,
      guildId: input.guildId,
      channelId: input.channelId,
      capability: input.capability,
      inputJson: input.inputJson,
      summary: input.summary,
      status: "pending",
      expiresAt: input.expiresAt,
      interactionToken: input.interactionToken ?? null,
      interactionApplicationId: input.interactionApplicationId ?? null,
    },
  });
}

export async function loadPendingActionByToken(token: string) {
  return prisma.pendingAction.findUnique({ where: { token } });
}

export type ResolvePendingActionInput = {
  token: string;
  status: Exclude<PendingActionStatus, "pending">;
  resultText?: string | null;
};

export async function resolvePendingAction(input: ResolvePendingActionInput) {
  return prisma.pendingAction.updateMany({
    where: {
      token: input.token,
      status: "pending",
    },
    data: {
      status: input.status,
      resultText: input.resultText ?? null,
      resolvedAt: new Date(),
    },
  });
}

export async function expirePendingActions(now: Date = new Date()) {
  const result = await prisma.pendingAction.updateMany({
    where: {
      status: "pending",
      expiresAt: { lt: now },
    },
    data: {
      status: "expired",
      resolvedAt: now,
      resultText: "Confirmation window expired.",
    },
  });
  return result.count;
}

export async function listPendingActionsForAdmin(options?: { limit?: number; statuses?: string[] }) {
  const limit = Math.min(Math.max(options?.limit ?? 100, 1), 500);
  const statuses = options?.statuses ?? ["pending", "executed", "cancelled", "expired", "failed"];
  return prisma.pendingAction.findMany({
    where: {
      status: { in: statuses },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

export async function updatePendingActionInteraction(payload: {
  token: string;
  interactionToken: string | null;
  interactionApplicationId: string | null;
}) {
  return prisma.pendingAction.updateMany({
    where: { token: payload.token, status: "pending" },
    data: {
      interactionToken: payload.interactionToken,
      interactionApplicationId: payload.interactionApplicationId,
    },
  });
}

export async function updatePendingActionSummary(payload: {
  token: string;
  summary: string;
}) {
  const summary = payload.summary.trim().slice(0, 500);
  return prisma.pendingAction.updateMany({
    where: { token: payload.token, status: "pending" },
    data: { summary },
  });
}

/** Count staged-action rows grouped by outcome (for observability). */
export async function countPendingActionsByStatus(): Promise<
  Partial<Record<PendingActionStatus, number>>
> {
  const rows = await prisma.pendingAction.groupBy({
    by: ["status"],
    _count: { status: true },
  });
  return Object.fromEntries(rows.map((r) => [r.status, r._count.status]));
}
