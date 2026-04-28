"use server";

import { randomUUID } from "node:crypto";
import { prisma } from "@repo/db";
import { invalidateRuntimeConfig } from "@repo/config/runtime-config";
import { assertAdminServer } from "@/lib/assert-admin-server";

export async function saveModelId(modelId: string) {
  await assertAdminServer();
  await prisma.botConfig.upsert({
    where: { key: "model_id" },
    create: { id: randomUUID(), key: "model_id", valueJson: JSON.stringify(modelId) },
    update: { valueJson: JSON.stringify(modelId) },
  });
  invalidateRuntimeConfig();
}
