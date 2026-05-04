/**
 * Scheduled-message cron worker.
 *
 * Replaces the workflow-based reminder path. Runs on the schedule in
 * apps/web/vercel.json (daily on Vercel Hobby; use sub-minute schedules on Pro)
 * and drains pending rows from `scheduled_message`. Two-step claim
 * via `claimDueScheduledMessages` ensures overlapping cron ticks don't double-
 * deliver. Rows are flipped to `sent` on success, `failed` on terminal error.
 *
 * Auth: requires the `Authorization: Bearer ${CRON_SECRET}` header that Vercel
 * Cron sends automatically. Requests without it are rejected so anyone hitting
 * the public URL can't trigger a flush.
 */

import { NextResponse } from "next/server";
import { discordRequest, loadDiscordToolConfig } from "@repo/discord-tools";
import { claimDueScheduledMessages, prisma } from "@repo/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_PER_TICK = 25;

function unauthorized(reason: string) {
  return NextResponse.json({ ok: false, reason }, { status: 401 });
}

function checkCronAuth(request: Request): string | null {
  const expected = process.env.CRON_SECRET?.trim();
  if (!expected) return "CRON_SECRET not configured";
  const got = request.headers.get("authorization");
  if (got !== `Bearer ${expected}`) return "bad cron auth";
  return null;
}

export async function GET(request: Request) {
  const denied = checkCronAuth(request);
  if (denied) return unauthorized(denied);

  const claimed = await claimDueScheduledMessages(MAX_PER_TICK);
  if (claimed.length === 0) {
    return NextResponse.json({ ok: true, processed: 0 });
  }

  const config = loadDiscordToolConfig();
  let sent = 0;
  let failed = 0;

  await Promise.all(
    claimed.map(async (row) => {
      try {
        const targetMentions = row.targetUserIds.length
          ? row.targetUserIds.map((id) => `<@${id}>`).join(" ") + " "
          : "";
        const content = `${targetMentions}${row.content}`.slice(0, 2000);
        const result = await discordRequest(config, {
          method: "POST",
          path: `/channels/${row.channelId}/messages`,
          body: {
            content,
            allowed_mentions: {
              parse: [],
              users: row.targetUserIds.slice(0, 20),
            },
          },
          auditReason: `agent-z scheduled_message ${row.id}`,
        });
        if (result.status >= 200 && result.status < 300) {
          await prisma.scheduledMessage.update({
            where: { id: row.id },
            data: {
              status: "sent",
              sentAt: new Date(),
              attempts: { increment: 1 },
              lastError: null,
            },
          });
          sent += 1;
        } else {
          throw new Error(`Discord status ${result.status}: ${result.rawBody.slice(0, 256)}`);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const nextAttempts = row.attempts + 1;
        const giveUp = nextAttempts >= 5;
        await prisma.scheduledMessage.update({
          where: { id: row.id },
          data: {
            // requeue for the next tick unless we hit the cap
            status: giveUp ? "failed" : "pending",
            attempts: nextAttempts,
            lastError: message.slice(0, 500),
          },
        });
        failed += 1;
        console.error(
          `[scheduled-msgs] ${row.id} attempt ${nextAttempts} failed:`,
          message
        );
      }
    })
  );

  return NextResponse.json({ ok: true, processed: claimed.length, sent, failed });
}
