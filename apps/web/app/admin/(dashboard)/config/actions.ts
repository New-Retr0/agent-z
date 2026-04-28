"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { prisma } from "@repo/db";
import { assertAdminServer } from "@/lib/assert-admin-server";
import { writeAuditEntry } from "@/lib/audit";
import { invalidateRuntimeConfig } from "@repo/config/runtime-config";

const ACTOR = "admin-ui";

export async function addRoleMapping(formData: FormData) {
  await assertAdminServer();
  const kind = String(formData.get("kind") ?? "").trim();
  const discordRoleId = String(formData.get("discord_role_id") ?? "").trim();
  if (!kind || !/^\d{17,20}$/.test(discordRoleId)) {
    throw new Error("kind and valid discord_role_id (snowflake) required");
  }
  const id = randomUUID();
  await prisma.roleMapping.create({
    data: { id, kind, discordRoleId },
  });
  await writeAuditEntry({
    actor: ACTOR,
    action: "role_mapping.create",
    target: id,
    afterJson: JSON.stringify({ kind, discordRoleId }),
  });
  revalidatePath("/admin/config");
}

export async function addChannelMapping(formData: FormData) {
  await assertAdminServer();
  const kind = String(formData.get("kind") ?? "").trim();
  const discordChannelId = String(formData.get("discord_channel_id") ?? "").trim();
  if (!kind || !/^\d{17,20}$/.test(discordChannelId)) {
    throw new Error("kind and valid discord_channel_id required");
  }
  const id = randomUUID();
  await prisma.channelMapping.create({
    data: { id, kind, discordChannelId },
  });
  await writeAuditEntry({
    actor: ACTOR,
    action: "channel_mapping.create",
    target: id,
    afterJson: JSON.stringify({ kind, discordChannelId }),
  });
  revalidatePath("/admin/config");
}

export async function upsertRateLimit(formData: FormData) {
  await assertAdminServer();
  const kind = String(formData.get("kind") ?? "").trim();
  const value = parseInt(String(formData.get("value") ?? "0"), 10);
  if (!kind || !Number.isFinite(value)) {
    throw new Error("kind and numeric value required");
  }
  await prisma.rateLimit.upsert({
    where: { kind },
    create: { id: randomUUID(), kind, value },
    update: { value },
  });
  await writeAuditEntry({
    actor: ACTOR,
    action: "rate_limit.upsert",
    target: kind,
    afterJson: JSON.stringify({ value }),
  });
  revalidatePath("/admin/config");
}

export async function setFeatureFlag(formData: FormData) {
  await assertAdminServer();
  const key = String(formData.get("key") ?? "").trim();
  const on = formData.has("enabled");
  if (key !== "public_tier_enabled" && key !== "message_content_intent") {
    throw new Error("Unsupported flag key");
  }
  const valueJson = JSON.stringify(on);
  const id = randomUUID();
  await prisma.botConfig.upsert({
    where: { key },
    create: { id, key, valueJson },
    update: { valueJson },
  });
  await writeAuditEntry({
    actor: ACTOR,
    action: "bot_config.set",
    target: key,
    afterJson: valueJson,
  });
  invalidateRuntimeConfig();
  revalidatePath("/admin/config");
}
