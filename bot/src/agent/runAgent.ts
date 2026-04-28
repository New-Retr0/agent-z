import { createGateway, generateText, stepCountIs } from "ai";
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { AgentZConfig } from "./botConfig.js";
import { isModeratorMember } from "./botConfig.js";
import { buildDiscordRestCheatsheet } from "./cheatsheet.js";
import { searchDocs } from "./knowledge.js";
import { systemPromptAddendumForTier } from "./tiers.js";
import type { AccessTier } from "./tiers.js";
import { buildAgentTools, type ToolBuildContext } from "./tools.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const BUNDLED_SYSTEM = join(HERE, "system-prompt.md");

const HUMOR = [
  "Typing…",
  "Still typing…",
  "A little more…",
  "Almost there…",
  "Finishing up…",
];

async function buildSystemMessageInner(args: {
  cfg: AgentZConfig;
  tier: AccessTier;
  guildId: string;
  sourceChannelId: string;
  invokerUserId: string;
  invokerName: string;
  userPrompt: string;
  memberRoleIds: string[];
}): Promise<string> {
  const path = args.cfg.promptOverridePath ?? BUNDLED_SYSTEM;
  const raw = await readFile(path, "utf8");
  const cs = buildDiscordRestCheatsheet(args.guildId);
  const isMod = isModeratorMember(args.memberRoleIds, args.cfg);
  const tierText = systemPromptAddendumForTier(args.tier);
  let top = "";
  const hits = await searchDocs(args.cfg, args.userPrompt, 1);
  if (hits[0] && hits[0].score > 0) {
    top = `**${hits[0].title}** (\`${hits[0].id}\`)\n${hits[0].snippet.slice(0, 1500)}`;
  } else {
    top = "_(no strong doc match; use search or list tools)_";
  }
  return raw
    .replaceAll("${GUILD_ID}", args.guildId)
    .replaceAll("${SOURCE_CHANNEL_ID}", args.sourceChannelId)
    .replaceAll("${INVOKER_USER_ID}", args.invokerUserId)
    .replaceAll("${INVOKER_NAME}", args.invokerName)
    .replaceAll("${IS_MODERATOR}", isMod ? "true" : "false")
    .replaceAll("${DISCORD_CHEATSHEET}", cs)
    .replaceAll("${TIER_ADDENDUM}", tierText)
    .replaceAll("${TOP_DOC}", top);
}

function gatewayModel(cfg: AgentZConfig) {
  return createGateway({ apiKey: cfg.aiGatewayApiKey })(cfg.modelId);
}

export async function runAgentZText(opts: {
  cfg: AgentZConfig;
  tier: AccessTier;
  userPrompt: string;
  toolCtx: ToolBuildContext;
  onProgressText?: (text: string) => Promise<void>;
}): Promise<string> {
  if (opts.tier === "DENY") {
    return "";
  }
  const system = await buildSystemMessageInner({
    cfg: opts.cfg,
    tier: opts.tier,
    guildId: opts.toolCtx.guildId,
    sourceChannelId: opts.toolCtx.channel.id,
    invokerUserId: opts.toolCtx.invoker.id,
    invokerName: opts.toolCtx.invokerDisplay,
    userPrompt: opts.userPrompt,
    memberRoleIds: opts.toolCtx.memberRoleIds,
  });
  const tools = buildAgentTools(opts.toolCtx);
  let step = 0;
  const t0 = Date.now();
  const result = await generateText({
    model: gatewayModel(opts.cfg),
    system,
    messages: [{ role: "user", content: opts.userPrompt }],
    tools,
    stopWhen: stepCountIs(10),
    onStepFinish: async () => {
      step += 1;
      if (Date.now() - t0 < 8000 && step < 2) {
        return;
      }
      const line = HUMOR[(step - 1) % HUMOR.length] ?? "…";
      await opts.onProgressText?.(`_${line} (step ${step})_`);
    },
  });
  const text = result.text?.trim() ?? "";
  if (!text) {
    return "_(no text response; check tool results above)_";
  }
  return text;
}
