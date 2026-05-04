/**
 * Agent Z runner — the unified entry point used by every Discord surface.
 *
 * Replaces the older `runDirectAgentZ` (single-shot `generateText` with no tools) and the workflow
 * SDK path (heavy, retried, no point for sub-second answers). It uses:
 *
 *   - **AI SDK 6 `ToolLoopAgent`** for the multi-step reasoning + tool-calling loop.
 *   - **`@ai-sdk/mcp` `createMCPClient`** to connect over HTTP to `apps/discord-mcp`, the tier-aware
 *     MCP server that hosts Discord tools, resources, and prompts.
 *   - **`stopWhen: stepCountIs(20)`** as a hard safety cap.
 *
 * The MCP client is opened *per request* so each call carries the right actor headers
 * (`X-Actor-Discord-*`). The discord-mcp server uses those headers to filter tools by tier — a public
 * caller never even sees the admin tools, so the LLM can't accidentally call them.
 *
 * If `DISCORD_MCP_URL` is unset, the runner degrades gracefully: it produces a plain answer with no
 * Discord tools attached. This keeps local development unblocked when only `apps/web` is running.
 */

import { ToolLoopAgent, stepCountIs } from "ai";
import { createMCPClient } from "@ai-sdk/mcp";
import { createGateway } from "@ai-sdk/gateway";
import { buildKnowledgeContext } from "@repo/knowledge";
import { getRuntimeConfig } from "@repo/config/runtime-config";
import { env } from "@repo/config/env";
import type { AgentReplyTarget, AgentTier, DiscordInvocationContext } from "@repo/agent/types";
import { resolveDiscordAccess } from "@/lib/discord-access";

export type RunAgentZInput = {
  prompt: string;
  invokerUserId: string;
  discordContext: DiscordInvocationContext;
  replyTarget?: AgentReplyTarget;
};

export type RunAgentZResult = {
  kind: "answer" | "denied" | "error";
  text: string;
  toolCallCount: number;
  stepCount: number;
};

const TIER_RANK = {
  public: 0,
  verified: 1,
  mod: 2,
  admin: 3,
} as const satisfies Record<AgentTier, number>;

function lowerTier(actual: AgentTier, max: AgentTier): AgentTier {
  return TIER_RANK[actual] <= TIER_RANK[max] ? actual : max;
}

/**
 * Build the actor headers we forward to the Discord MCP server. The MCP server re-resolves the
 * caller's tier from these — we cannot escalate ourselves, only declare what the caller looks like
 * from Discord's side.
 */
function buildActorHeaders(
  invokerUserId: string,
  ctx: DiscordInvocationContext
): Record<string, string> {
  const headers: Record<string, string> = {
    "x-actor-discord-user-id": invokerUserId,
  };
  if (ctx.guildId) headers["x-actor-discord-guild-id"] = ctx.guildId;
  if (ctx.channelId) headers["x-actor-discord-channel-id"] = ctx.channelId;
  if (ctx.roleIds.length) headers["x-actor-discord-role-ids"] = ctx.roleIds.join(",");
  if (ctx.isDirectMessage) headers["x-actor-discord-is-dm"] = "1";
  return headers;
}

function buildSystemPrompt(tier: AgentTier, knowledge: string, override: string | null): string {
  const base =
    override?.trim() ||
    "You are Agent Z, a helpful Discord moderation and community assistant for this server.";
  return `${base}

Operating context:
- Resolved tier: ${tier}
- You can call Discord tools through the MCP connection. The MCP server has already filtered the tool set to what this caller is allowed to use; if a tool you would expect is missing, the caller does not have permission for it. Do not pretend you ran a tool you cannot see.
- Always cite message IDs and timestamps when referring to specific Discord events.
- Never invent server data. If a tool result is empty or ambiguous, say so.
- Destructive admin tools (bulk_delete_messages, role removals) require an explicit human confirmation via MCP elicitation. If the client doesn't confirm, abort.
- Never claim to have persistent memory across conversations in this Phase 2 build — that's coming in Phase 3.
- Replies are posted into Discord, so format them concisely. Use short paragraphs and inline code spans where useful. Avoid headers and giant code blocks unless the user explicitly asked for them.

Bundled local knowledge that may be relevant:
${knowledge}`;
}

async function getMcpClientOrNull(
  invokerUserId: string,
  ctx: DiscordInvocationContext
): Promise<Awaited<ReturnType<typeof createMCPClient>> | null> {
  const url = process.env.DISCORD_MCP_URL?.trim();
  const apiKey = process.env.DISCORD_MCP_API_KEY?.trim();
  if (!url || !apiKey) {
    return null;
  }
  try {
    const client = await createMCPClient({
      transport: {
        type: "http",
        url,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          ...buildActorHeaders(invokerUserId, ctx),
        },
      },
    });
    return client;
  } catch (error) {
    // Fail-soft: log and continue without tools so the agent can still answer Q&A.
    console.error("[agent-z] Failed to open MCP client:", error);
    return null;
  }
}

/**
 * Run a single agent turn. The caller is expected to do channel-allowlist enforcement via
 * `resolveDiscordAccess` before calling — we re-run it here as a defensive double-check.
 */
export async function runAgentZ(input: RunAgentZInput): Promise<RunAgentZResult> {
  const access = await resolveDiscordAccess(input.discordContext);
  if (!access.allowed) {
    return { kind: "denied", text: access.reason, toolCallCount: 0, stepCount: 0 };
  }

  // Lower the effective tier to "verified" for the chat-mention path; staff use /agent-z-admin to opt
  // into the higher-impact tools. This means an admin chatting in #general doesn't accidentally use
  // bulk_delete_messages.
  const tier = lowerTier(access.tier, "verified");

  if (!env.AI_GATEWAY_API_KEY) {
    return {
      kind: "error",
      text: "Agent Z is missing AI Gateway credentials. Set AI_GATEWAY_API_KEY (Vercel OIDC link recommended).",
      toolCallCount: 0,
      stepCount: 0,
    };
  }

  const rc = await getRuntimeConfig();
  const knowledge = await buildKnowledgeContext(input.prompt, 5);
  const model = createGateway({ apiKey: env.AI_GATEWAY_API_KEY })(rc.modelId);
  const system = buildSystemPrompt(tier, knowledge, rc.systemPromptOverride);

  const mcp = await getMcpClientOrNull(input.invokerUserId, input.discordContext);
  let tools: Awaited<ReturnType<NonNullable<typeof mcp>["tools"]>> | undefined;
  if (mcp) {
    try {
      tools = await mcp.tools();
    } catch (error) {
      console.error("[agent-z] Failed to list MCP tools:", error);
    }
  }

  let toolCallCount = 0;
  let stepCount = 0;

  try {
    const agent = new ToolLoopAgent({
      model,
      instructions: system,
      tools: tools ?? {},
      stopWhen: stepCountIs(20),
      experimental_telemetry: { isEnabled: true, functionId: "agent-z-turn" },
      onStepFinish: (step) => {
        stepCount += 1;
        if (step.toolCalls?.length) toolCallCount += step.toolCalls.length;
      },
    });

    const result = await agent.generate({
      prompt: input.prompt,
    });

    const text = result.text.trim() || "I could not produce a useful answer.";
    return { kind: "answer", text, toolCallCount, stepCount };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      kind: "error",
      text: `Agent Z hit an error: ${message}`,
      toolCallCount,
      stepCount,
    };
  } finally {
    if (mcp) {
      try {
        await mcp.close();
      } catch {
        // best-effort close
      }
    }
  }
}
