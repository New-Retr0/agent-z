/**
 * Agent Z runner — the unified entry point used by every Discord surface.
 *
 * Replaces the older `runDirectAgentZ` (single-shot `generateText` with no tools). It uses:
 *
 *   - **AI SDK 6 `ToolLoopAgent`** for the multi-step reasoning + tool-calling loop.
 *   - **`@ai-sdk/mcp` `createMCPClient`** to connect over HTTP to `apps/discord-mcp`, the tier-aware
 *     MCP server that hosts Discord tools, resources, and prompts.
 *   - **`stopWhen: stepCountIs(20)`** as a hard safety cap.
 *
 * Channel-scoped memory (`loadRecentTurns`) is replayed as **`messages`** (user / assistant turns),
 * not embedded as a plaintext log in the system prompt.
 *
 * The MCP client is opened *per request* so each call carries the right actor headers
 * (`X-Actor-Discord-*`). The discord-mcp server uses those headers to filter tools by tier — a public
 * caller never even sees the admin tools, so the LLM can't accidentally call them.
 *
 * If `DISCORD_MCP_URL` is unset, the runner degrades gracefully: it produces a plain answer with no
 * Discord tools attached. This keeps local development unblocked when only `apps/web` is running.
 *
 * Scoped **Oversight** semantic recall (pgvector) is merged into the final user message when the
 * prompt passes a small gate — same primitive as MCP `search_server_messages`, without requiring the
 * model to remember to call it.
 */

import { ToolLoopAgent, stepCountIs, createGateway, type ModelMessage, type ToolSet } from "ai";
import { createMCPClient } from "@ai-sdk/mcp";
import { STATIC_AGENT_BOT_HINTS } from "./static-bot-hints";
import { getRuntimeConfig } from "@repo/config/runtime-config";
import { env } from "@repo/config/env";
import type { AgentReplyTarget, AgentTier, DiscordInvocationContext } from "@repo/agent/types";
import { loadRecentTurns, loadUserProfile, recordConversationTurn } from "@repo/db";
import { resolveDiscordAccess } from "@/lib/discord-access";
import {
  closeContext7Client,
  isContext7Configured,
  openContext7Client,
  type Context7Connection,
} from "./context7-mcp";
import { buildAgentZPromptBlocks } from "./context";
import { buildAdminSystemPrompt, buildPublicSystemPrompt } from "./prompts";
import { turnsToChatMessages } from "./conversation-messages";
import { formatRecallBlock, retrieveOversightSnippets, shouldRunSemanticRecall } from "./retrieval";
import {
  extractPaTokenFromAssistantText,
  extractPaTokenFromGenerateTextResult,
  impliesStagingWasClaimedWithoutToken,
  stagingMismatchFooter,
  stripMisleadingButtonPromises,
} from "./pending-action-token";
import {
  DISCORD_ADMIN_REPLY_MAX_CHARS,
  DISCORD_PUBLIC_REPLY_MAX_CHARS,
  truncateDiscordReply,
} from "@/lib/discord-replies";

export type RunAgentZInput = {
  prompt: string;
  invokerUserId: string;
  discordContext: DiscordInvocationContext;
  replyTarget?: AgentReplyTarget;
  /** Public `/agent-z` vs staff `/agent-z-admin` (tier cap + prompt). */
  surface?: "public" | "admin";
  /** Slash interaction id for staging confirm buttons (admin surface). */
  discordInteraction?: {
    token: string;
    applicationId: string;
  };
};

export type RunAgentZResult = {
  kind: "answer" | "denied" | "error";
  text: string;
  toolCallCount: number;
  stepCount: number;
  /** Set when a staged destructive MCP tool queued a row — Discord attaches Confirm/Cancel using this. */
  stagedPaToken?: string;
  /** Namespaced `discord_*` tools merged into this turn (0 if MCP disconnected / misconfigured). */
  discordToolsOffered?: number;
};

function buildActorHeaders(
  invokerUserId: string,
  ctx: DiscordInvocationContext,
  opts: {
    surface: "public" | "admin";
    interaction?: { token: string; applicationId: string };
  }
): Record<string, string> {
  const headers: Record<string, string> = {
    "x-actor-discord-user-id": invokerUserId,
  };
  if (ctx.guildId) headers["x-actor-discord-guild-id"] = ctx.guildId;
  if (ctx.channelId) headers["x-actor-discord-channel-id"] = ctx.channelId;
  if (ctx.roleIds.length) headers["x-actor-discord-role-ids"] = ctx.roleIds.join(",");
  if (ctx.isDirectMessage) headers["x-actor-discord-is-dm"] = "1";

  if (opts.surface === "public") {
    headers["x-agent-z-tier-cap"] = "verified";
  }
  if (opts.interaction?.token) headers["x-agent-z-interaction-token"] = opts.interaction.token;
  if (opts.interaction?.applicationId) {
    headers["x-agent-z-interaction-application-id"] = opts.interaction.applicationId;
  }
  return headers;
}

async function getMcpClientOrNull(
  invokerUserId: string,
  ctx: DiscordInvocationContext,
  opts: {
    surface: "public" | "admin";
    discordInteraction?: { token: string; applicationId: string };
  }
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
          ...buildActorHeaders(invokerUserId, ctx, {
            surface: opts.surface,
            interaction: opts.discordInteraction,
          }),
        },
      },
    });
    return client;
  } catch (error) {
    console.error("[agent-z] Failed to open MCP client:", error);
    return null;
  }
}

/**
 * Run a single agent turn. The caller is expected to do channel-allowlist enforcement via
 * `resolveDiscordAccess` before calling — we re-run it here as a defensive double-check.
 */
export async function runAgentZ(input: RunAgentZInput): Promise<RunAgentZResult> {
  const surface = input.surface ?? "public";
  const ctxWithUser: DiscordInvocationContext = {
    ...input.discordContext,
    invokerUserId: input.discordContext.invokerUserId ?? input.invokerUserId,
  };

  const access = await resolveDiscordAccess(ctxWithUser);
  if (!access.allowed) {
    return { kind: "denied", text: access.reason, toolCallCount: 0, stepCount: 0 };
  }

  const TIER_ORDER: AgentTier[] = ["public", "verified", "mod", "admin"];
  function capTier(t: AgentTier, max: AgentTier): AgentTier {
    return TIER_ORDER.indexOf(t) <= TIER_ORDER.indexOf(max) ? t : max;
  }

  const promptTier: AgentTier =
    surface === "public" ? capTier(access.tier, "verified") : access.tier;

  if (!env.AI_GATEWAY_API_KEY) {
    return {
      kind: "error",
      text: "Agent Z is missing AI Gateway credentials. Set AI_GATEWAY_API_KEY (Vercel OIDC link recommended).",
      toolCallCount: 0,
      stepCount: 0,
    };
  }

  const rc = await getRuntimeConfig();
  const channelId = input.discordContext.channelId;
  const [recentTurns, invokerProfile] = await Promise.all([
    channelId ? loadRecentTurns({ channelId, limit: 12 }) : Promise.resolve([]),
    loadUserProfile(input.invokerUserId).catch((error) => {
      console.error("[agent-z] Failed to load user profile:", error);
      return null;
    }),
  ]);
  const model = createGateway({ apiKey: env.AI_GATEWAY_API_KEY })(rc.modelId);
  const context7Configured = isContext7Configured();
  const promptArgs = buildAgentZPromptBlocks({
    tier: promptTier,
    knowledge: STATIC_AGENT_BOT_HINTS,
    override: rc.systemPromptOverride,
    invokerUserId: input.invokerUserId,
    discordCtx: ctxWithUser,
    invokerProfile,
    context7Available: context7Configured,
  });
  const system =
    surface === "admin"
      ? buildAdminSystemPrompt(promptArgs)
      : buildPublicSystemPrompt(promptArgs);

  // Record the user turn up front so it shows up on the next call even if the agent fails.
  if (channelId) {
    recordConversationTurn({
      channelId,
      userId: input.invokerUserId,
      role: "user",
      content: input.prompt,
      modelId: rc.modelId,
    }).catch((error) => {
      console.error("[agent-z] Failed to record user turn:", error);
    });
  }

  const [mcp, context7] = await Promise.all([
    getMcpClientOrNull(input.invokerUserId, ctxWithUser, {
      surface,
      discordInteraction: input.discordInteraction,
    }),
    context7Configured ? openContext7Client() : Promise.resolve<Context7Connection | null>(null),
  ]);

  // Merge tools from both MCP transports onto a single tool map. Discord MCP
  // owns the `agent-z-*` namespace; Context7 provides `resolve-library-id` /
  // `get-library-docs`. Tool names don't collide.
  let tools: ToolSet = {} as ToolSet;
  if (mcp) {
    try {
      const discordTools = await mcp.tools();
      tools = { ...tools, ...(discordTools as ToolSet) };
    } catch (error) {
      console.error("[agent-z] Failed to list Discord MCP tools:", error);
    }
  }
  if (context7) {
    try {
      const context7Tools = await context7.client.tools();
      tools = { ...tools, ...(context7Tools as ToolSet) };
    } catch (error) {
      console.error("[agent-z] Failed to list Context7 MCP tools:", error);
    }
  }

  const discordToolsOffered = Object.keys(tools).filter((name) => name.startsWith("discord_")).length;

  let toolCallCount = 0;
  let stepCount = 0;

  try {
    const agent = new ToolLoopAgent({
      model,
      instructions: system,
      tools,
      stopWhen: stepCountIs(20),
      experimental_telemetry: { isEnabled: true, functionId: "agent-z-turn" },
      onStepFinish: (step) => {
        stepCount += 1;
        if (step.toolCalls?.length) toolCallCount += step.toolCalls.length;
      },
    });

    let userContent = input.prompt;
    if (channelId && shouldRunSemanticRecall(input.prompt)) {
      const hits = await retrieveOversightSnippets({
        query: input.prompt.slice(0, 2000),
        channelId,
        guildId: ctxWithUser.guildId ?? undefined,
        limit: 6,
      });
      const block = formatRecallBlock(hits);
      if (block) {
        userContent = `${block}\n\n---\n${input.prompt}`;
      }
    }

    const messages: ModelMessage[] = [
      ...turnsToChatMessages(recentTurns, input.invokerUserId),
      { role: "user" as const, content: userContent },
    ];

    const result = await agent.generate({
      messages,
    });

    let text = result.text.trim() || "I could not produce a useful answer.";
    text = truncateDiscordReply(
      text,
      surface === "public" ? DISCORD_PUBLIC_REPLY_MAX_CHARS : DISCORD_ADMIN_REPLY_MAX_CHARS
    );
    const stagedPaToken =
      extractPaTokenFromGenerateTextResult(result) ?? extractPaTokenFromAssistantText(text) ?? undefined;

    if (surface === "admin" && !stagedPaToken && impliesStagingWasClaimedWithoutToken(text)) {
      text = `${stripMisleadingButtonPromises(text)}${stagingMismatchFooter(discordToolsOffered)}`.trim();
    }
    // Best-effort: record the assistant turn so future invocations see it.
    if (channelId) {
      recordConversationTurn({
        channelId,
        userId: input.invokerUserId,
        role: "assistant",
        content: text,
        modelId: rc.modelId,
      }).catch((error) => {
        console.error("[agent-z] Failed to record assistant turn:", error);
      });
    }
    return { kind: "answer", text, toolCallCount, stepCount, stagedPaToken, discordToolsOffered };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      kind: "error",
      text: `Agent Z hit an error: ${message}`,
      toolCallCount,
      stepCount,
      discordToolsOffered,
    };
  } finally {
    if (mcp) {
      try {
        await mcp.close();
      } catch {
        // best-effort close
      }
    }
    await closeContext7Client(context7);
  }
}
