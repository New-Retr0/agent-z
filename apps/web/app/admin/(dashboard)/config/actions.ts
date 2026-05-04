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

/**
 * Persists the verify-on-reaction policy. All four columns are written
 * together so partial updates can't leave the bot in a half-configured state
 * (which would make verifyUserFromReaction reject every reaction).
 */
export async function setVerifyConfig(formData: FormData) {
  await assertAdminServer();
  const verifiedRoleId = String(formData.get("verified_role_id") ?? "").trim();
  const verifyChannelId = String(formData.get("verify_channel_id") ?? "").trim();
  const verifyMessageId = String(formData.get("verify_message_id") ?? "").trim();
  const verifyEmoji = String(formData.get("verify_emoji") ?? "").trim() || "✅";
  const welcomeDmTemplate = String(formData.get("welcome_dm_template") ?? "").trim();

  // Allow blank role/channel ids so admins can clear the config to disable verify.
  if (verifiedRoleId && !/^\d{17,20}$/.test(verifiedRoleId)) {
    throw new Error("verified_role_id must be a snowflake or empty");
  }
  if (verifyChannelId && !/^\d{17,20}$/.test(verifyChannelId)) {
    throw new Error("verify_channel_id must be a snowflake or empty");
  }
  if (verifyMessageId && !/^\d{17,20}$/.test(verifyMessageId)) {
    throw new Error("verify_message_id must be a snowflake or empty");
  }

  const writes: Array<{ key: string; value: string }> = [
    { key: "verified_role_id", value: JSON.stringify(verifiedRoleId || null) },
    { key: "verify_channel_id", value: JSON.stringify(verifyChannelId || null) },
    { key: "verify_message_id", value: JSON.stringify(verifyMessageId || null) },
    { key: "verify_emoji", value: JSON.stringify(verifyEmoji) },
  ];
  if (welcomeDmTemplate) {
    writes.push({ key: "welcome_dm_template", value: JSON.stringify(welcomeDmTemplate) });
  }

  for (const w of writes) {
    await prisma.botConfig.upsert({
      where: { key: w.key },
      create: { id: randomUUID(), key: w.key, valueJson: w.value },
      update: { valueJson: w.value },
    });
  }
  await writeAuditEntry({
    actor: ACTOR,
    action: "bot_config.verify_set",
    target: "verify",
    afterJson: JSON.stringify({
      verifiedRoleId,
      verifyChannelId,
      verifyMessageId,
      verifyEmoji,
      welcomeDmTemplateLength: welcomeDmTemplate.length,
    }),
  });
  invalidateRuntimeConfig();
  revalidatePath("/admin/config");
}
