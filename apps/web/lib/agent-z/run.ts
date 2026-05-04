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
import {
  loadRecentTurns,
  loadUserProfile,
  recordConversationTurn,
  type ProfileNote,
  type UserProfileSnapshot,
} from "@repo/db";
import { resolveDiscordAccess } from "@/lib/discord-access";
import {
  closeContext7Client,
  isContext7Configured,
  openContext7Client,
  type Context7Connection,
} from "./context7-mcp";

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

function formatProfileForPrompt(profile: UserProfileSnapshot | null): string {
  if (!profile) return "No prior profile on file for this user.";
  const lastNotes = profile.notes.slice(-15);
  const notesBlock = lastNotes.length
    ? lastNotes
        .map((n: ProfileNote) => `  - (${n.kind ?? "note"}) ${n.text}`)
        .join("\n")
    : "  (no notes yet)";
  const prefsKeys = Object.keys(profile.preferences);
  const prefsBlock = prefsKeys.length
    ? prefsKeys.map((k) => `  - ${k}: ${JSON.stringify(profile.preferences[k])}`).join("\n")
    : "  (no preferences recorded)";
  const lastSeen = profile.lastSeenAt
    ? profile.lastSeenAt.toISOString()
    : "never recorded";
  return `Display name: ${profile.displayName ?? "unknown"}
Last seen: ${lastSeen}
Notes:
${notesBlock}
Preferences:
${prefsBlock}`;
}

function buildSystemPrompt(args: {
  tier: AgentTier;
  knowledge: string;
  override: string | null;
  invokerUserId: string;
  invokerProfile: UserProfileSnapshot | null;
  recentTurnsBlock: string;
  context7Available: boolean;
}): string {
  const base =
    args.override?.trim() ||
    "You are Agent Z, a Vercel-stack expert and Discord moderation/community assistant for this server. You specialize in helping with Vercel, Next.js, the AI SDK, Vercel Workflow, Vercel Sandbox, and the broader Vercel platform — and you operate the server itself through tier-gated Discord tools.";
  const context7Block = args.context7Available
    ? `- Vercel-expert grounding: a Context7 MCP transport is connected. For ANY question about Vercel, Next.js, the AI SDK, Vercel Workflow, Drizzle, Tailwind, shadcn/ui, or other libraries Context7 indexes, call \`resolve-library-id\` first, then \`get-library-docs\` to ground your answer in the live docs. Quote short snippets and cite the library id you used. Do not answer Vercel/Next.js questions from memory if Context7 is reachable.
- Vercel Agent Skills: when the question maps to a known Vercel domain (auth, integrations, deployments, AI SDK, workflows), pick the Context7 library most likely to cover it (e.g. \`vercel/next.js\`, \`vercel/ai\`, \`vercel/workflow\`, \`shadcn-ui/ui\`) before resolving. Prefer the Vercel-canonical library when multiple resolve.`
    : `- Vercel-expert grounding: Context7 docs lookup is currently unavailable. Answer Vercel/Next.js questions from your training but say "based on what I know — please double-check the Vercel docs" so users know it isn't live-grounded.`;
  return `${base}

Operating context:
- Resolved tier: ${args.tier}
- Invoker user id: ${args.invokerUserId}
- You can call Discord tools through the MCP connection. The MCP server has already filtered the tool set to what this caller is allowed to use; if a tool you would expect is missing, the caller does not have permission for it. Do not pretend you ran a tool you cannot see.
${context7Block}
- Always cite message IDs and timestamps when referring to specific Discord events.
- Never invent server data. If a tool result is empty or ambiguous, say so.
- Destructive admin tools (bulk_delete_messages, role removals) require an explicit human confirmation via MCP elicitation. If the client doesn't confirm, abort.
- You DO have persistent memory across conversations: the most recent turns and the invoker's profile are loaded into this prompt every time. When the user says "remember that…", you should call the remember_about_user MCP tool (verified+ tier) to persist it, not just acknowledge it.
- For "find that conversation about X" / "when did Y come up" type questions, use the \`search_server_messages\` MCP tool (Oversight Layer — pgvector semantic search). For "show me what @user posted" use \`find_user_messages\`. For "summarize this channel" use \`summarize_channel_activity\` then summarize the returned messages yourself.
- If the user asks to be forgotten, instruct them to run /forget-me; do not try to wipe data through tool calls.
- Replies are posted into Discord, so format them concisely. Use short paragraphs and inline code spans where useful. Avoid headers and giant code blocks unless the user explicitly asked for them.

What you remember about the invoker:
${formatProfileForPrompt(args.invokerProfile)}

Recent turns in this channel (oldest first):
${args.recentTurnsBlock}

Bundled local knowledge that may be relevant:
${args.knowledge}`;
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
  const [knowledge, recentTurns, invokerProfile] = await Promise.all([
    buildKnowledgeContext(input.prompt, 5),
    loadRecentTurns({ channelId: input.discordContext.channelId, limit: 12 }),
    loadUserProfile(input.invokerUserId).catch((error) => {
      console.error("[agent-z] Failed to load user profile:", error);
      return null;
    }),
  ]);
  const recentTurnsBlock = recentTurns.length
    ? recentTurns
        .map((t) => {
          const author = t.role === "assistant" ? "agent-z" : t.userId;
          const time = t.createdAt.toISOString();
          return `[${time}] ${t.role}<${author}>: ${t.content}`;
        })
        .join("\n")
    : "(no prior turns in this channel)";
  const model = createGateway({ apiKey: env.AI_GATEWAY_API_KEY })(rc.modelId);
  const context7Configured = isContext7Configured();
  const system = buildSystemPrompt({
    tier,
    knowledge,
    override: rc.systemPromptOverride,
    invokerUserId: input.invokerUserId,
    invokerProfile,
    recentTurnsBlock,
    context7Available: context7Configured,
  });

  // Record the user turn up front so it shows up on the next call even if the agent fails.
  recordConversationTurn({
    channelId: input.discordContext.channelId,
    userId: input.invokerUserId,
    role: "user",
    content: input.prompt,
    modelId: rc.modelId,
  }).catch((error) => {
    console.error("[agent-z] Failed to record user turn:", error);
  });

  const [mcp, context7] = await Promise.all([
    getMcpClientOrNull(input.invokerUserId, input.discordContext),
    context7Configured ? openContext7Client() : Promise.resolve<Context7Connection | null>(null),
  ]);

  // Merge tools from both MCP transports onto a single tool map. Discord MCP
  // owns the `agent-z-*` namespace; Context7 provides `resolve-library-id` /
  // `get-library-docs`. Tool names don't collide.
  let tools: Record<string, unknown> = {};
  if (mcp) {
    try {
      const discordTools = await mcp.tools();
      tools = { ...tools, ...(discordTools as Record<string, unknown>) };
    } catch (error) {
      console.error("[agent-z] Failed to list Discord MCP tools:", error);
    }
  }
  if (context7) {
    try {
      const context7Tools = await context7.client.tools();
      tools = { ...tools, ...(context7Tools as Record<string, unknown>) };
    } catch (error) {
      console.error("[agent-z] Failed to list Context7 MCP tools:", error);
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
    // Best-effort: record the assistant turn so future invocations see it.
    recordConversationTurn({
      channelId: input.discordContext.channelId,
      userId: input.invokerUserId,
      role: "assistant",
      content: text,
      modelId: rc.modelId,
    }).catch((error) => {
      console.error("[agent-z] Failed to record assistant turn:", error);
    });
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
    await closeContext7Client(context7);
  }
}
