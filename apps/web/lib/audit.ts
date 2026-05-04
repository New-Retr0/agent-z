import { randomUUID } from "node:crypto";
import { prisma } from "@repo/db";

export async function writeAuditEntry(input: {
  actor: string;
  action: string;
  target: string;
  beforeJson?: string | null;
  afterJson?: string | null;
}) {
  if (!process.env.DATABASE_URL) {
    return;
  }
  try {
    await prisma.auditLog.create({
      data: {
        id: randomUUID(),
        actor: input.actor,
        action: input.action,
        target: input.target,
        beforeJson: input.beforeJson ?? null,
        afterJson: input.afterJson ?? null,
      },
    });
  } catch (e) {
    console.error("[audit]", e);
  }
}
