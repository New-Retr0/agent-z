import { getRuntimeConfig } from "@repo/config/runtime-config";
import { getOversightStats, listPendingActionsForAdmin, loadUserProfile } from "@repo/db";
import { introspectMcp } from "@/lib/mcp-introspect";
import type { AgentTier } from "@repo/agent/types";
import type { DiscordInvocationContext } from "@repo/agent/types";
import { buildAgentZPromptBlocks } from "./context";
import { buildAdminSystemPrompt, buildPublicSystemPrompt } from "./prompts";
import { STATIC_AGENT_BOT_HINTS } from "./static-bot-hints";
import { isContext7Configured } from "./context7-mcp";
import { retrieveOversightSnippets, shouldRunSemanticRecall } from "./retrieval";

export async function formatAgentZWhyDebugMarkdown(args: {
  surface: "public" | "admin";
  tier: AgentTier;
  discordCtx: DiscordInvocationContext;
  invokerUserId: string;
  /** Sample prompt used for retrieval demo */
  samplePrompt?: string;
}): Promise<string> {
  const rc = await getRuntimeConfig();
  const context7Available = isContext7Configured();
  const profile = await loadUserProfile(args.invokerUserId).catch(() => null);
  const blocks = buildAgentZPromptBlocks({
    tier: args.tier,
    knowledge: STATIC_AGENT_BOT_HINTS,
    override: rc.systemPromptOverride,
    invokerUserId: args.invokerUserId,
    discordCtx: args.discordCtx,
    invokerProfile: profile,
    context7Available,
  });
  const system =
    args.surface === "admin" ? buildAdminSystemPrompt(blocks) : buildPublicSystemPrompt(blocks);

  const mcp = await introspectMcp();
  const oversight = await getOversightStats().catch(() => null);
  const pending = await listPendingActionsForAdmin({ limit: 8 }).catch(() => []);

  const sample =
    args.samplePrompt?.trim() ||
    "Agent Z diagnostic probe — semantic recall smoke test.";
  let recallPreview = "(skipped — sample too short)";
  if (shouldRunSemanticRecall(sample)) {
    const hits = await retrieveOversightSnippets({
      query: sample.slice(0, 500),
      channelId: args.discordCtx.channelId,
      guildId: args.discordCtx.guildId,
      limit: 4,
    });
    recallPreview =
      hits.length === 0
        ? "(no hits above threshold — backlog/embeddings may be empty)"
        : hits.map((h) => `- ${h.similarity.toFixed(2)} ${h.id}: ${h.excerpt}`).join("\n");
  }

  const pendingLines =
    pending.length === 0
      ? "(none)"
      : pending.map((p) => `- ${p.token.slice(0, 18)}… ${p.status} · ${p.capability}`).join("\n");

  return [
    "**Agent Z — diagnostic (`why`)**",
    "",
    `- **surface**: ${args.surface}`,
    `- **tier**: ${args.tier}`,
    `- **model**: \`${rc.modelId}\``,
    `- **AI Gateway key**: ${process.env.AI_GATEWAY_API_KEY?.trim() ? "set" : "MISSING"}`,
    `- **Discord MCP (web)**: ${process.env.DISCORD_MCP_URL?.trim() && process.env.DISCORD_MCP_API_KEY?.trim() ? "DISCORD_MCP_URL+KEY set" : "missing — tools won't load on apps/web"}`,
    `- **Context7**: ${context7Available ? "on" : "off"}`,
    `- **MCP introspect**: ${mcp.available ? `${mcp.tools.length} tools` : `unavailable (${mcp.error ?? "unknown"})`}`,
    `- **Oversight archive**: ${oversight ? `total=${oversight.total} embedded=${oversight.embedded} pending_embed=${oversight.pending}` : "(stats unavailable)"}`,
    "",
    "**Semantic recall preview** (same pipeline as host-injected recall):",
    "```",
    recallPreview,
    "```",
    "",
    "**Recent pending actions:**",
    "```",
    pendingLines,
    "```",
    "",
    "**Effective system prompt (truncated):**",
    "```",
    system.slice(0, 3500) + (system.length > 3500 ? "\n…(truncated)" : ""),
    "```",
  ].join("\n");
}
