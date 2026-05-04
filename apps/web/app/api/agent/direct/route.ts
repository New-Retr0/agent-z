import { NextResponse } from "next/server";
import { runAgentZ } from "@/lib/agent-z/run";
import { formatDiscordChunks, postDiscordChannelMessage } from "@/lib/discord-replies";
import {
  parseDiscordContext,
  parsePrompt,
  parseReplyTarget,
  readJsonRecord,
  stringProp,
  timingSafeSecretEqual,
} from "@/lib/workflow-request";

/**
 * Internal endpoint called by the chat-bot mention/DM handlers (`packages/chat-bot/src/invoke-direct.ts`).
 *
 * Phase 2 swap: this used to call `runDirectAgentZ` (single-shot `generateText` with no tools and an
 * inline reminder-proposal heuristic). It now calls the shared `runAgentZ` runner which uses
 * `ToolLoopAgent` + an in-process MCP client to the Discord MCP server. The reminder workflow path is
 * intentionally removed here — Phase 3 reintroduces scheduling via a `schedule_message` MCP tool that
 * writes to the new `ScheduledMessage` table.
 */

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  const expectedSecret = process.env.AGENT_Z_INTERNAL_SECRET;
  const auth = request.headers.get("authorization");
  const actualSecret = auth?.startsWith("Bearer ") ? auth.slice("Bearer ".length) : null;
  if (!timingSafeSecretEqual(actualSecret, expectedSecret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await readJsonRecord(request);
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const prompt = parsePrompt(body.prompt);
  const invokerUserId = stringProp(body, "invokerUserId");
  const discordContext = parseDiscordContext(body.discordContext);
  const replyTarget = parseReplyTarget(body.replyTarget);
  if (!prompt || !invokerUserId || !discordContext || !replyTarget) {
    return NextResponse.json(
      { error: "prompt, invokerUserId, discordContext, and replyTarget are required" },
      { status: 400 }
    );
  }

  const result = await runAgentZ({
    prompt,
    invokerUserId,
    discordContext,
    replyTarget,
  });

  if (replyTarget._type === "discord:Channel") {
    const chunks = formatDiscordChunks(result.text);
    for (let i = 0; i < chunks.length; i++) {
      await postDiscordChannelMessage(replyTarget.channelId, chunks[i] ?? "", {
        messageId: i === 0 ? replyTarget.messageId : undefined,
      });
    }
  }

  return NextResponse.json({
    delivered: replyTarget._type === "discord:Channel",
    kind: result.kind,
    toolCallCount: result.toolCallCount,
    stepCount: result.stepCount,
  });
}
