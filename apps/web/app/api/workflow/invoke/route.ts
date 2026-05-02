import { randomUUID } from "node:crypto";
import { start } from "workflow/api";
import { NextResponse } from "next/server";
import { runAgentZWorkflow } from "@/workflows/agent-z";
import { resolveDiscordAccess } from "@/lib/discord-access";
import { resolveWorkflowRateLimit } from "@/lib/rate-limit";
import {
  parseAgentTier,
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
import type { AgentTier } from "@repo/agent/types";

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

  const discordContext = parseDiscordContext(body.discordContext);
  const access = await resolveDiscordAccess(discordContext);
  if (!access.allowed) {
    return NextResponse.json({ error: access.reason }, { status: 403 });
  }
  const requiredTier = parseAgentTier(body.requiredTier, "public");
  if (!requiredTier) {
    return NextResponse.json({ error: "Invalid required tier" }, { status: 400 });
  }
  if (!tierMeetsMinimum(access.tier, requiredTier)) {
    return NextResponse.json({ error: `This command requires ${requiredTier} access.` }, { status: 403 });
  }
  const maxTier = parseAgentTier(body.maxTier, access.tier);
  if (!maxTier) {
    return NextResponse.json({ error: "Invalid max tier" }, { status: 400 });
  }

  const invokerUserId = stringProp(body, "invokerUserId") || "0";
  const rateLimit = await resolveWorkflowRateLimit(invokerUserId);
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: rateLimit.reason }, { status: 429 });
  }

  const replyTarget = parseReplyTarget(body.replyTarget);
  const rc = await getRuntimeConfig();
  const tier = lowerTier(access.tier, maxTier);
  const system = await buildSystemPrompt(rc, tier);
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
        discordContext,
        invokerUserId,
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

const TIER_RANK = {
  public: 0,
  verified: 1,
  mod: 2,
  admin: 3,
} as const satisfies Record<AgentTier, number>;

function tierMeetsMinimum(actual: AgentTier, required: AgentTier) {
  return TIER_RANK[actual] >= TIER_RANK[required];
}

function lowerTier(actual: AgentTier, max: AgentTier) {
  return TIER_RANK[actual] <= TIER_RANK[max] ? actual : max;
}

async function buildSystemPrompt(rc: Awaited<ReturnType<typeof getRuntimeConfig>>, tier: AgentTier) {
  const base = "You are Agent Z, a helpful assistant for this Discord community.";
  const tierGuidance =
    tier === "public" || tier === "verified"
      ? [
          "You are running in normal community mode.",
          "Do not mention internal tool names, MCP tools, health checks, intent logging, workflows, run IDs, admin panels, or moderation/server-management capabilities.",
          "Do not offer to change server settings, moderate users, inspect private data, or perform admin actions.",
          "If asked what you can do, describe normal user-facing help: answer questions, explain public community/project docs, summarize public context, and help draft or clarify messages.",
          "If a user needs staff-only actions, tell them staff can use `/agent-z-admin`.",
        ].join(" ")
      : [
          "You are running in elevated staff mode.",
          "You may help with staff operations available to this tier, but do not dump raw internal tool names unless the user explicitly asks for implementation details.",
          "Be careful with moderation or server-management actions and explain what you are doing before making changes.",
        ].join(" ");
  if (rc.systemPromptOverride?.trim()) {
    return `${base}\n\n${rc.systemPromptOverride}\n\n${tierGuidance}`;
  }
  return `${base}\n\n${tierGuidance}`;
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
