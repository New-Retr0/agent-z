import { randomUUID } from "node:crypto";
import { start } from "workflow/api";
import { NextResponse } from "next/server";
import { runAgentZWorkflow } from "@/workflows/agent-z";
import { getRuntimeConfig } from "@repo/config/runtime-config";
import { cookies } from "next/headers";
import { ADMIN_COOKIE, verifyAdminToken } from "@/lib/admin-session";
import { parseAgentTier, parsePrompt, parseSystemPrompt, readJsonRecord } from "@/lib/workflow-request";
import { prisma } from "@repo/db";

export const runtime = "nodejs";

const ADMIN_PLACEHOLDER_USER = "100000000000000000";

export async function POST(request: Request) {
  const secret = process.env.AGENT_Z_ADMIN_SECRET;
  const token = (await cookies()).get(ADMIN_COOKIE)?.value;
  if (!verifyAdminToken(secret, token)) {
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

  const tier = parseAgentTier(body.tier, "admin");
  if (!tier) {
    return NextResponse.json({ error: "Invalid tier" }, { status: 400 });
  }
  const rc = await getRuntimeConfig();
  const system = parseSystemPrompt(body.system) ?? "You are Agent Z.";
  const agentRunId = randomUUID();
  try {
    await prisma.agentRun.create({
      data: {
        id: agentRunId,
        tier,
        invokerUserId: ADMIN_PLACEHOLDER_USER,
        prompt,
        modelId: rc.modelId,
        status: "running",
      },
    });
  } catch (e) {
    console.error("[workflow/run] create AgentRun", e);
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
      },
    ]);
  } catch (e) {
    console.error("[workflow/run] start workflow", e);
    await markRunFailed(agentRunId, e);
    return NextResponse.json({ error: "Could not start workflow" }, { status: 500 });
  }

  try {
    await prisma.agentRun.update({
      where: { id: agentRunId },
      data: { workflowRunId: run.runId, lastWebhookAt: new Date() },
    });
  } catch (e) {
    console.error("[workflow/run] link workflow", e);
    return NextResponse.json(
      { error: "Workflow started but AgentRun could not be linked", runId: run.runId, agentRunId },
      { status: 500 }
    );
  }
  return NextResponse.json({ started: true, runId: run.runId, agentRunId });
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
