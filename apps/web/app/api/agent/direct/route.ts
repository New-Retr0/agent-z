import { NextResponse } from "next/server";
import { runDirectAgentZ } from "@/lib/agent-z/direct";
import { formatDiscordChunks, postDiscordChannelMessage } from "@/lib/discord-replies";
import {
  parseDiscordContext,
  parsePrompt,
  parseReplyTarget,
  readJsonRecord,
  stringProp,
  timingSafeSecretEqual,
} from "@/lib/workflow-request";

export const runtime = "nodejs";

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
    return NextResponse.json({ error: "prompt, invokerUserId, discordContext, and replyTarget are required" }, { status: 400 });
  }

  const result = await runDirectAgentZ({
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
        components: i === 0 && result.kind === "workflowProposal" ? result.components : undefined,
      });
    }
  }

  return NextResponse.json({ delivered: replyTarget._type === "discord:Channel", kind: result.kind });
}
