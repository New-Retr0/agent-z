import {
  ChannelType,
  type Client,
  type Guild,
  type GuildTextBasedChannel,
  type Interaction,
  type Message,
  MessageFlags,
} from "discord.js";
import { checkRateLimit } from "./rateLimit.js";
import {
  loadAgentZConfig,
  loadAgentZConfigForHelp,
  type AgentZConfig,
} from "./botConfig.js";
import { buildHelpEmbed, buildHelpRow, getHelpState, parseHelpId } from "./help.js";
import { parseConfirmId, resolveConfirmByButton } from "./confirmations.js";
import { memberRoleIds, passesInvokeGate, resolveAccessTier } from "./tiers.js";
import { runAgentZText } from "./runAgent.js";
import type { ToolBuildContext } from "./tools.js";
import { chunkDiscordMessage } from "./chunk.js";

/**
 * Slash/button interactions in a server may omit `guild` if the client lost cache.
 * Fetch by id so help pagination and role resolution still work.
 */
async function resolveInteractionGuild(
  client: Client,
  interaction: Interaction
): Promise<Guild | null> {
  if (!interaction.inGuild() || !interaction.guildId) {
    return null;
  }
  if (interaction.guild) {
    return interaction.guild;
  }
  try {
    return await client.guilds.fetch(interaction.guildId);
  } catch {
    return null;
  }
}

/** Help, invoke gate, and tiers — does not require AI_GATEWAY_API_KEY. */
function tryCfgForHelp(): AgentZConfig | null {
  try {
    return loadAgentZConfigForHelp();
  } catch (e) {
    console.error("[Agent Z] config:", e);
    return null;
  }
}

/** Full config including AI Gateway — required for LLM + doc tools in the agent runner. */
function tryCfgFull(): AgentZConfig | null {
  try {
    return loadAgentZConfig();
  } catch (e) {
    console.error("[Agent Z] config:", e);
    return null;
  }
}

/**
 * From gateway payload (slash) or member cache. API interaction members can expose `roles: string[]`.
 */
function roleIdArray(
  m: Message["member"] | Interaction["member"] | null
): string[] {
  if (!m) {
    return [];
  }
  if (typeof m === "object" && "roles" in m) {
    const r = m.roles;
    if (Array.isArray(r)) {
      return r as string[];
    }
    if (r && "cache" in r && r.cache) {
      return [...r.cache.keys()];
    }
  }
  return memberRoleIds(m as { roles: { cache: Map<string, unknown> } } | null);
}

/** When the gateway omits `member` or roles, resolve via REST (no Guild Members intent). */
async function ensureMessageRoleIds(
  guild: Guild,
  member: Message["member"],
  userId: string
): Promise<string[]> {
  if (member) {
    const r = roleIdArray(member);
    if (r.length > 0) {
      return r;
    }
  }
  try {
    const mem = await guild.members.fetch({ user: userId, force: true });
    return [...mem.roles.cache.keys()];
  } catch {
    return [];
  }
}

async function resolveInteractionRoleIds(
  member: Interaction["member"],
  guild: Guild,
  userId: string
): Promise<string[]> {
  const fromPayload = roleIdArray(member);
  if (fromPayload.length > 0) {
    return fromPayload;
  }
  try {
    const mem = await guild.members.fetch({ user: userId, force: true });
    return [...mem.roles.cache.keys()];
  } catch {
    return [];
  }
}

function isGuildTextCh(
  ch: Message["channel"] | Interaction["channel"] | null
): ch is GuildTextBasedChannel {
  if (!ch) {
    return false;
  }
  if (ch.type === ChannelType.DM) {
    return false;
  }
  if (!ch.isTextBased()) {
    return false;
  }
  return "guild" in ch && ch.guild != null;
}

/** Message this one replies to (resolves partials; falls back to channel fetch). */
async function fetchReferencedMessage(message: Message): Promise<Message | null> {
  const id = message.reference?.messageId;
  if (!id) {
    return null;
  }
  try {
    let ref: Message;
    try {
      ref = await message.fetchReference();
    } catch {
      const ch = message.channel;
      if (!ch || !("messages" in ch)) {
        return null;
      }
      ref = await ch.messages.fetch(id);
    }
    if (ref.partial) {
      ref = await ref.fetch();
    }
    return ref;
  } catch {
    return null;
  }
}

function formatReplyContext(ref: Message, botUserId: string): string {
  const fromBot = ref.author.id === botUserId;
  const who = fromBot
    ? "Agent Z (earlier reply)"
    : `${ref.author.globalName ?? ref.author.username} (message being replied to)`;
  const body = ref.content?.trim() || "_(no text in that message — e.g. embeds only)_";
  return (
    `The user is continuing a thread using Discord’s reply feature. ` +
      `They are replying to this prior message (${who}):\n` +
      `---\n${body}\n---\n\n` +
      `Their new message (answer in light of the above):\n`
  );
}

export async function handleMessageCreate(client: Client, message: Message): Promise<void> {
  if (message.author.bot) {
    return;
  }
  if (!message.inGuild() || !message.guild) {
    return;
  }
  const botId = client.user?.id ?? "";
  const referencedMessage = await fetchReferencedMessage(message);
  const mentionsBot = botId ? message.mentions.has(botId) : false;
  const isReplyToBot =
    referencedMessage != null && referencedMessage.author.id === botId;
  if (!mentionsBot && !isReplyToBot) {
    return;
  }
  const cfg = tryCfgForHelp();
  if (!cfg) {
    return;
  }
  const rids = await ensureMessageRoleIds(message.guild, message.member, message.author.id);
  if (!passesInvokeGate(rids, cfg)) {
    return;
  }
  const limit = checkRateLimit(message.author.id, cfg);
  if (!limit.ok) {
    await message
      .reply({ content: `Rate limited. Try again in **${limit.retryAfterSec}**s.` })
      .catch(() => undefined);
    return;
  }
  const tier = resolveAccessTier(
    { channelId: message.channelId, memberRoleIds: rids, isDm: false },
    cfg
  );
  if (tier === "DENY") {
    return;
  }
  let text = message.content
    .replaceAll(`<@${client.user?.id ?? ""}>`, "")
    .replaceAll(`<@!${client.user?.id ?? ""}>`, "")
    .trim();
  if (/^\s*help\s*$/i.test(text)) {
    if (!message.guild) {
      return;
    }
    const st = await getHelpState(cfg, message.guild, rids);
    const embed = buildHelpEmbed({
      role: st.role,
      page: 1,
      total: st.pages.length,
      pageData: st.pages[0]!,
    });
    const row = buildHelpRow(st.role, 1, st.pages.length);
    await message.reply({ embeds: [embed], components: [row] }).catch(() => undefined);
    return;
  }
  if (!text) {
    if (referencedMessage) {
      await message
        .reply({
          content:
            "I didn’t get any text on your message. If you did type something, enable **Message Content Intent** in the Developer Portal, set **AGENT_Z_MESSAGE_CONTENT_INTENT=1** in the bot `.env`, and restart — then @-mentions and replies work. Otherwise add a line of text to your reply.",
        })
        .catch(() => undefined);
      return;
    }
    if (!message.guild) {
      return;
    }
    const st = await getHelpState(cfg, message.guild, rids);
    const embed = buildHelpEmbed({
      role: st.role,
      page: 1,
      total: st.pages.length,
      pageData: st.pages[0]!,
    });
    const row = buildHelpRow(st.role, 1, st.pages.length);
    await message.reply({ embeds: [embed], components: [row] }).catch(() => undefined);
    return;
  }
  const ch = message.channel;
  if (!isGuildTextCh(ch)) {
    return;
  }
  const fullCfg = tryCfgFull();
  if (!fullCfg) {
    await message
      .reply({
        content:
          "I need **AI_GATEWAY_API_KEY** in the bot `.env` (Vercel AI Gateway) to run prompts. Help still works: `/help` or `/agent-z help`.",
      })
      .catch(() => undefined);
    return;
  }
  let userPrompt = text;
  if (referencedMessage) {
    userPrompt = formatReplyContext(referencedMessage, botId) + text;
  }
  const toolCtx: ToolBuildContext = {
    cfg: fullCfg,
    tier,
    guildId: message.guildId!,
    channel: ch,
    invoker: message.author,
    invokerDisplay: message.author.globalName ?? message.author.username,
    memberRoleIds: rids,
  };
  const status = await message.reply({ content: "_Typing…_" });
  const textOut = await runAgentZText({
    cfg: fullCfg,
    tier,
    userPrompt,
    toolCtx,
    onProgressText: async (line) => {
      await status.edit({ content: line }).catch(() => undefined);
    },
  });
  const chunks = chunkDiscordMessage(textOut);
  if (chunks[0] != null) {
    await status.edit({ content: chunks[0] || "\u2014" }).catch(() => undefined);
  }
  for (let c = 1; c < chunks.length; c++) {
    const part = chunks[c]!;
    await ch.send({ content: part, allowedMentions: { parse: [] } }).catch(() => undefined);
  }
}

export async function handleInteractionCreate(
  _client: Client,
  interaction: Interaction
): Promise<void> {
  if (interaction.isButton()) {
    const p = parseHelpId(interaction.customId);
    if (p?.action === "close") {
      await interaction
        .update({ content: "Closed.", embeds: [], components: [] })
        .catch(() => undefined);
      return;
    }
    if (p?.action === "nav") {
      const cfg = tryCfgForHelp();
      const guild = await resolveInteractionGuild(_client, interaction);
      if (!cfg || !guild) {
        await interaction
          .reply({ content: "Config error.", flags: MessageFlags.Ephemeral })
          .catch(() => undefined);
        return;
      }
      const rids = await resolveInteractionRoleIds(
        interaction.member,
        guild,
        interaction.user.id
      );
      const st = await getHelpState(cfg, guild, rids);
      const max = st.pages.length;
      const page = Math.min(Math.max(1, p.page), max);
      const data = st.pages[page - 1] ?? st.pages[0]!;
      const embed = buildHelpEmbed({ role: st.role, page, total: max, pageData: data });
      const row = buildHelpRow(st.role, page, max);
      await interaction.update({ embeds: [embed], components: [row] }).catch(() => undefined);
      return;
    }
    const c = parseConfirmId(interaction.customId);
    if (c) {
      const r = resolveConfirmByButton(c.id, interaction.user.id, c.kind);
      if (r.notForYou) {
        await interaction
          .reply({ content: "This confirmation is not for you.", flags: MessageFlags.Ephemeral })
          .catch(() => undefined);
        return;
      }
      if (r.ok) {
        const label = c.kind === "yes" ? "Confirmed." : "Cancelled.";
        await interaction.update({ content: label, components: [] }).catch(() => undefined);
      } else {
        await interaction
          .reply({ content: "Expired or already handled.", flags: MessageFlags.Ephemeral })
          .catch(() => undefined);
      }
    }
    return;
  }
  if (!interaction.isChatInputCommand()) {
    return;
  }
  const isTopLevelHelp = interaction.commandName === "help";
  if (interaction.commandName !== "agent-z" && !isTopLevelHelp) {
    return;
  }
  const cfg = tryCfgForHelp();
  if (!cfg) {
    await interaction
      .reply({
        content:
          "Agent Z is not configured (env). Set **DISCORD_BOT_TOKEN** and the **AGENT_Z_** / reaction variables in the repo `.env` (see `bot/.env.example`).",
        flags: MessageFlags.Ephemeral,
      })
      .catch(() => undefined);
    return;
  }
  const guild = await resolveInteractionGuild(_client, interaction);
  if (!guild) {
    await interaction
      .reply({ content: "Use this in a server channel.", flags: MessageFlags.Ephemeral })
      .catch(() => undefined);
    return;
  }
  const rids = await resolveInteractionRoleIds(
    interaction.member,
    guild,
    interaction.user.id
  );
  if (!passesInvokeGate(rids, cfg)) {
    return;
  }
  if (isTopLevelHelp) {
    const st = await getHelpState(cfg, guild, rids);
    const embed = buildHelpEmbed({
      role: st.role,
      page: 1,
      total: st.pages.length,
      pageData: st.pages[0]!,
    });
    const row = buildHelpRow(st.role, 1, st.pages.length);
    await interaction
      .reply({ embeds: [embed], components: [row], flags: MessageFlags.Ephemeral })
      .catch(() => undefined);
    return;
  }
  const sub = interaction.options.getSubcommand(true);
  if (sub === "help") {
    const st = await getHelpState(cfg, guild, rids);
    const embed = buildHelpEmbed({
      role: st.role,
      page: 1,
      total: st.pages.length,
      pageData: st.pages[0]!,
    });
    const row = buildHelpRow(st.role, 1, st.pages.length);
    await interaction
      .reply({ embeds: [embed], components: [row], flags: MessageFlags.Ephemeral })
      .catch(() => undefined);
    return;
  }
  if (sub !== "prompt") {
    return;
  }
  const fullCfg = tryCfgFull();
  if (!fullCfg) {
    await interaction
      .reply({
        content:
          "`/agent-z prompt` needs **AI_GATEWAY_API_KEY** in the bot `.env` (Vercel AI Gateway: https://vercel.com/ai). `/help` still works without it.",
        flags: MessageFlags.Ephemeral,
      })
      .catch(() => undefined);
    return;
  }
  const limit = checkRateLimit(interaction.user.id, fullCfg);
  if (!limit.ok) {
    await interaction
      .reply({
        content: `Rate limited. Try in **${limit.retryAfterSec}**s.`,
        flags: MessageFlags.Ephemeral,
      })
      .catch(() => undefined);
    return;
  }
  const raw = interaction.options.getString("text", true);
  if (/^\s*help\s*$/i.test(raw)) {
    const st = await getHelpState(cfg, guild, rids);
    const embed = buildHelpEmbed({
      role: st.role,
      page: 1,
      total: st.pages.length,
      pageData: st.pages[0]!,
    });
    const row = buildHelpRow(st.role, 1, st.pages.length);
    await interaction
      .reply({ embeds: [embed], components: [row], flags: MessageFlags.Ephemeral })
      .catch(() => undefined);
    return;
  }
  const tier = resolveAccessTier(
    { channelId: interaction.channelId, memberRoleIds: rids, isDm: false },
    fullCfg
  );
  if (tier === "DENY") {
    return;
  }
  const ch = interaction.channel;
  if (!isGuildTextCh(ch)) {
    return;
  }
  const user = interaction.user;
  const toolCtx: ToolBuildContext = {
    cfg: fullCfg,
    tier,
    guildId: interaction.guildId!,
    channel: ch,
    invoker: user,
    invokerDisplay: user.displayName,
    memberRoleIds: rids,
  };
  // Immediate reply avoids Discord’s default deferred “…is thinking…” copy; we show “Typing…” instead.
  await interaction.reply({ content: "_Typing…_" });
  const textOut = await runAgentZText({
    cfg: fullCfg,
    tier,
    userPrompt: raw,
    toolCtx,
    onProgressText: async (line) => {
      await interaction.editReply({ content: line }).catch(() => undefined);
    },
  });
  const chunks = chunkDiscordMessage(textOut);
  for (let i = 0; i < chunks.length; i++) {
    const part = chunks[i]!;
    if (i === 0) {
      await interaction.editReply({ content: part || "\u2014" }).catch(() => undefined);
    } else {
      await interaction
        .followUp({ content: part, allowedMentions: { parse: [] } })
        .catch(() => undefined);
    }
  }
}
