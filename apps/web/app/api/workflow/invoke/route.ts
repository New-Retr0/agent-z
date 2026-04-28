import { randomUUID } from "node:crypto";
import { start } from "workflow/api";
import { NextResponse } from "next/server";
import { runAgentZWorkflow } from "@/workflows/agent-z";
import { resolveDiscordAccess } from "@/lib/discord-access";
import {
  parseDiscordContext,
  parsePrompt,
  parseReplyTarget,
  readJsonRecord,
  stringProp,
  timingSafeSecretEqual,
} from "@/lib/workflow-request";
import { getRuntimeConfig } from "@repo/config/runtime-config";
import { env } from "@repo/config/env";
import { prisma } from "@repo/db";

export const runtime = "nodejs";

/**
 * Internal: Discord bot (or other backends) starts a workflow without an admin cookie.
 * `Authorization: Bearer <AGENT_Z_INTERNAL_SECRET>`
 */
export async function POST(request: Request) {
  const auth = request.headers.get("authorization");
  const token = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!timingSafeSecretEqual(token, env.AGENT_Z_INTERNAL_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: "DATABASE_URL is required to start Agent Z workflows" }, { status: 503 });
  }

  const body = await readJsonRecord(request);
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const prompt = parsePrompt(body.prompt);
  if (!prompt) {
    return NextResponse.json({ error: "prompt required and must be 1-8000 characters" }, { status: 400 });
  }

  const access = await resolveDiscordAccess(parseDiscordContext(body.discordContext));
  if (!access.allowed) {
    return NextResponse.json({ error: access.reason }, { status: 403 });
  }

  const invokerUserId = stringProp(body, "invokerUserId") || "0";
  const replyTarget = parseReplyTarget(body.replyTarget);
  const rc = await getRuntimeConfig();
  const tier = access.tier;
  const system = await buildSystemPrompt(rc);
  const agentRunId = randomUUID();
  try {
    await prisma.agentRun.create({
      data: {
        id: agentRunId,
        tier,
        invokerUserId,
        prompt,
        modelId: rc.modelId,
        status: "running",
      },
    });
  } catch (e) {
    console.error("[workflow/invoke] create AgentRun", e);
    return NextResponse.json({ error: "Could not create AgentRun" }, { status: 500 });
  }

  let run: { runId: string };
  try {
    run = await start(runAgentZWorkflow, [
      {
        agentRunId,
        prompt,
        modelId: rc.modelId,
        system,
        tier,
        replyTarget,
      },
    ]);
  } catch (e) {
    console.error("[workflow/invoke] start workflow", e);
    await markRunFailed(agentRunId, e);
    return NextResponse.json({ error: "Could not start workflow" }, { status: 500 });
  }

  try {
    await prisma.agentRun.update({
      where: { id: agentRunId },
      data: { workflowRunId: run.runId, lastWebhookAt: new Date() },
    });
  } catch (e) {
    console.error("[workflow/invoke] link workflow", e);
    return NextResponse.json(
      { error: "Workflow started but AgentRun could not be linked", runId: run.runId, agentRunId },
      { status: 500 }
    );
  }
  return NextResponse.json({ started: true, runId: run.runId, agentRunId, tier });
}

async function buildSystemPrompt(rc: Awaited<ReturnType<typeof getRuntimeConfig>>) {
  const base = "You are Agent Z, a helpful assistant for this Discord community.";
  if (rc.systemPromptOverride?.trim()) {
    return `${base}\n\n${rc.systemPromptOverride}`;
  }
  return base;
}

async function markRunFailed(agentRunId: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
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
    // best-effort after a failed workflow start
  }
}
