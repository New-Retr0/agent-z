/**
 * One-off / CI: copy legacy verify-on-reaction env vars into Postgres `BotConfig`
 * (canonical source for `@repo/config/runtime-config`).
 *
 * Usage (from repo root):
 *   DATABASE_URL='…' npm run seed:config -w @repo/db
 */

import { randomUUID } from "node:crypto";
import { prisma } from "../src/client.js";

async function upsertBotConfig(key: string, valueJson: string) {
  const id = randomUUID();
  await prisma.botConfig.upsert({
    where: { key },
    create: { id, key, valueJson },
    update: { valueJson },
  });
  console.log(`[seed:config] BotConfig.${key}`);
}

async function main() {
  let wrote = 0;
  const entries: Array<{ key: string; value: string | undefined }> = [
    { key: "verified_role_id", value: process.env.REACTION_VERIFIED_ROLE_ID?.trim() },
    { key: "verify_channel_id", value: process.env.DISCORD_RULES_CHANNEL_ID?.trim() },
    { key: "verify_message_id", value: process.env.REACTION_MESSAGE_ID?.trim() },
    { key: "verify_emoji", value: process.env.REACTION_EMOJI?.trim() },
  ];

  for (const { key, value } of entries) {
    if (!value) continue;
    await upsertBotConfig(key, JSON.stringify(value));
    wrote += 1;
  }

  if (wrote === 0) {
    console.warn(
      "[seed:config] No matching env vars set — skipped.\nExpected at least one of: REACTION_VERIFIED_ROLE_ID, DISCORD_RULES_CHANNEL_ID, REACTION_MESSAGE_ID, REACTION_EMOJI."
    );
  }
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}
