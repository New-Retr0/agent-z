import { randomUUID } from "node:crypto";
import { ChannelImpl, ThreadImpl } from "chat";
import { getBot } from "@repo/chat-bot";
import { prisma } from "@repo/db";
import type { AgentReplyTarget } from "@repo/agent/types";
import type { SerializedChannel, SerializedThread } from "chat";

/** Minimal `onFinish` / `onStepFinish` payload we persist (avoids `ai` type depth in step bundle). */
type FinishPayload = {
  totalUsage?: { inputTokens?: number; outputTokens?: number } | null;
  steps: Array<{
    text: string;
    toolCalls: unknown;
    usage: unknown;
  }>;
};

/**
 * Prisma + Node in a **use step** bundle (separate from the workflow function).
 */
export async function stepPersistAgentRunFinish(agentRunId: string, event: FinishPayload) {
  "use step";
  if (!process.env.DATABASE_URL) return;
  const total = event.totalUsage;
  const tokensIn = total?.inputTokens ?? 0;
  const tokensOut = total?.outputTokens ?? 0;
  const steps = event.steps;
  await prisma.agentRun.update({
    where: { id: agentRunId },
    data: {
      status: "completed",
      stepCount: steps.length,
      tokensIn,
      tokensOut,
      finishedAt: new Date(),
      lastWebhookAt: new Date(),
    },
  });
  let i = 0;
  for (const step of steps) {
    await prisma.agentRunStep.create({
      data: {
        id: randomUUID(),
        runId: agentRunId,
        stepIndex: i++,
        text: step.text || null,
        toolCalls: (step.toolCalls as object) ?? null,
        usage: step.usage as object,
      },
    });
  }
}

export async function stepMarkAgentRunFailed(agentRunId: string, err: unknown) {
  "use step";
  if (!process.env.DATABASE_URL) return;
  const message = err instanceof Error ? err.message : String(err);
  try {
    await prisma.agentRun.update({
      where: { id: agentRunId },
      data: {
        status: `failed: ${message.slice(0, 120)}`,
        finishedAt: new Date(),
        lastWebhookAt: new Date(),
      },
    });
  } catch {
    /* best-effort */
  }
}

export async function stepPostAgentRunReply(
  replyTarget: AgentReplyTarget | undefined,
  agentRunId: string,
  text: string
) {
  "use step";
  if (!replyTarget) {
    return;
  }

  try {
    if (replyTarget._type === "discord:Interaction") {
      for (const chunk of formatDiscordChunks(agentRunId, text)) {
        await postDiscordInteractionFollowup(replyTarget.applicationId, replyTarget.interactionToken, chunk);
      }
      return;
    }
    if (replyTarget._type === "discord:Channel") {
      for (const chunk of formatDiscordChunks(agentRunId, text)) {
        await postDiscordChannelMessage(replyTarget.channelId, chunk, replyTarget.messageId);
      }
      return;
    }

    getBot().registerSingleton();
    const target =
      replyTarget._type === "chat:Thread"
        ? ThreadImpl.fromJSON(replyTarget as SerializedThread)
        : ChannelImpl.fromJSON(replyTarget as SerializedChannel);

    for (const chunk of formatDiscordChunks(agentRunId, text)) {
      await target.post({ markdown: chunk });
    }
  } catch (error) {
    console.error("[agent-run-persist] post Discord reply", error);
  }
}

async function postDiscordInteractionFollowup(applicationId: string, interactionToken: string, content: string) {
  const response = await fetch(`https://discord.com/api/v10/webhooks/${applicationId}/${interactionToken}?wait=true`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      content,
      flags: 64,
      allowed_mentions: { parse: [] },
    }),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Discord interaction follow-up failed: ${response.status} ${body.slice(0, 200)}`);
  }
}

async function postDiscordChannelMessage(channelId: string, content: string, messageId?: string) {
  const botToken = process.env.DISCORD_BOT_TOKEN?.trim();
  if (!botToken) {
    throw new Error("DISCORD_BOT_TOKEN is required to post Discord replies");
  }

  const body: Record<string, unknown> = {
    content,
    allowed_mentions: { parse: [] },
  };
  if (messageId) {
    body.message_reference = {
      message_id: messageId,
      channel_id: channelId,
      fail_if_not_exists: false,
    };
  }

  const response = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bot ${botToken}`,
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const responseBody = await response.text();
    throw new Error(`Discord channel message failed: ${response.status} ${responseBody.slice(0, 200)}`);
  }
}

export function formatDiscordChunks(agentRunId: string, text: string): string[] {
  const header = `**Agent Z result** (run \`${agentRunId.slice(0, 8)}...\`)\n\n`;
  const body = text.trim() || "The workflow completed, but no final text was returned.";
  const firstLimit = 1_900 - header.length;
  const chunks: string[] = [];
  let remaining = body;

  chunks.push(`${header}${remaining.slice(0, firstLimit)}`);
  remaining = remaining.slice(firstLimit);

  while (remaining.length > 0) {
    chunks.push(remaining.slice(0, 1_900));
    remaining = remaining.slice(1_900);
  }

  return chunks;
}
