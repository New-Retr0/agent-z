/**
 * One-shot: @everyone cannot View categories/channels; @Verified can use the server
 * as a normal member. The rules channel: @everyone gets View, history, react, and
 * Send (Discord onboarding 350005 needs one @everyone read+send channel). Apply
 * rules overwrites *before* hiding categories.
 *
 * Required env (repo root .env):
 *   DISCORD_BOT_TOKEN, DISCORD_RULES_CHANNEL_ID, REACTION_VERIFIED_ROLE_ID
 *   GUILD: REACTION_GUILD_ID or DISCORD_GUILD_ID or a single DISCORD_ALLOWED_GUILD_IDS
 *
 * Usage (from /bot):
 *   node scripts/apply-unverified-lockdown.mjs
 *   node scripts/apply-unverified-lockdown.mjs --dry-run
 */
import { config } from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { PermissionFlagsBits, ChannelType } from "discord-api-types/v10";

const __dirname = dirname(fileURLToPath(import.meta.url));
const botRoot = join(__dirname, "..");
const repoRoot = join(botRoot, "..");
config({ path: join(repoRoot, ".env") });
config({ path: join(botRoot, ".env"), override: true });

const DRY = process.argv.includes("--dry-run");
const API = (p) => `https://discord.com/api/v10${p}`;

const token = process.env.DISCORD_BOT_TOKEN?.trim();
if (!token) {
  console.error("Missing DISCORD_BOT_TOKEN");
  process.exit(1);
}

const rulesChannelId =
  process.env.DISCORD_RULES_CHANNEL_ID?.trim() || process.env.RULES_CHANNEL_ID?.trim();
if (!rulesChannelId) {
  console.error("Set DISCORD_RULES_CHANNEL_ID to your #rules text channel (snowflake).");
  process.exit(1);
}

const verifiedRoleId = process.env.REACTION_VERIFIED_ROLE_ID?.trim();
if (!verifiedRoleId) {
  console.error("Set REACTION_VERIFIED_ROLE_ID");
  process.exit(1);
}

function resolveGuildId() {
  const ex =
    process.env.REACTION_GUILD_ID?.trim() ?? process.env.DISCORD_GUILD_ID?.trim();
  if (ex) return ex;
  const list = (process.env.DISCORD_ALLOWED_GUILD_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (list.length === 1) return list[0];
  throw new Error("Set REACTION_GUILD_ID, DISCORD_GUILD_ID, or one id in DISCORD_ALLOWED_GUILD_IDS");
}

const guildId = resolveGuildId();
/** @everyone overwrite id is the guild id */
const everyoneRoleId = guildId;

const verifiedChannelBits =
  PermissionFlagsBits.CreateInstantInvite |
  PermissionFlagsBits.AddReactions |
  PermissionFlagsBits.ViewChannel |
  PermissionFlagsBits.SendMessages |
  PermissionFlagsBits.EmbedLinks |
  PermissionFlagsBits.AttachFiles |
  PermissionFlagsBits.ReadMessageHistory |
  PermissionFlagsBits.MentionEveryone |
  PermissionFlagsBits.UseExternalEmojis |
  PermissionFlagsBits.Connect |
  PermissionFlagsBits.Speak |
  PermissionFlagsBits.Stream |
  PermissionFlagsBits.UseVAD |
  PermissionFlagsBits.PrioritySpeaker |
  PermissionFlagsBits.RequestToSpeak |
  PermissionFlagsBits.UseEmbeddedActivities |
  PermissionFlagsBits.CreatePublicThreads |
  PermissionFlagsBits.CreatePrivateThreads |
  PermissionFlagsBits.SendMessagesInThreads |
  PermissionFlagsBits.UseApplicationCommands |
  PermissionFlagsBits.UseExternalStickers |
  PermissionFlagsBits.UseSoundboard |
  PermissionFlagsBits.SendVoiceMessages |
  PermissionFlagsBits.SendPolls |
  PermissionFlagsBits.PinMessages |
  PermissionFlagsBits.BypassSlowmode |
  PermissionFlagsBits.UseExternalApps;

/** Unverified in #rules: read, send, react (send required for onboarding API) */
const everyoneRulesAllow =
  PermissionFlagsBits.ViewChannel |
  PermissionFlagsBits.ReadMessageHistory |
  PermissionFlagsBits.AddReactions |
  PermissionFlagsBits.SendMessages;
const everyoneRulesDeny = 0n;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function strBits(b) {
  return b === 0n ? "0" : String(b);
}

async function apiGet(path) {
  const r = await fetch(API(path), {
    headers: { Authorization: `Bot ${token}` },
  });
  if (r.status === 429) {
    const j = await r.json().catch(() => ({}));
    const w = (j.retry_after ?? 1) * 1000;
    await sleep(w);
    return apiGet(path);
  }
  if (!r.ok) throw new Error(`GET ${path} ${r.status}: ${await r.text()}`);
  return r.json();
}

async function putOverwrite(channelId, roleId, allow, deny) {
  if (DRY) {
    console.log(
      `DRY  channel ${channelId} role ${roleId} allow=${strBits(allow)} deny=${strBits(deny)}`
    );
    return;
  }
  const body = {
    type: 0,
    id: roleId,
    allow: strBits(allow),
    deny: strBits(deny),
  };
  for (;;) {
    const r = await fetch(API(`/channels/${channelId}/permissions/${roleId}`), {
      method: "PUT",
      headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (r.status === 429) {
      const j = await r.json().catch(() => ({}));
      await sleep((j.retry_after ?? 1) * 1000);
      continue;
    }
    if (!r.ok) {
      const t = await r.text();
      throw new Error(`PUT /channels/${channelId}/permissions/${roleId} ${r.status}: ${t}`);
    }
    return;
  }
}

const channels = await apiGet(`/guilds/${guildId}/channels`);
const ordered = [...channels].sort(
  (a, b) =>
    (a.type === ChannelType.GuildCategory ? 0 : 1) -
      (b.type === ChannelType.GuildCategory ? 0 : 1) ||
    (a.position ?? 0) - (b.position ?? 0)
);

const denyViewEveryone = PermissionFlagsBits.ViewChannel;
const allowNone = 0n;

// 1) Rules first: satisfies onboarding "one @everyone read+send channel" before we hide the rest
const rulesCh = channels.find((c) => c.id === rulesChannelId);
if (!rulesCh) {
  console.error(`No channel with id ${rulesChannelId} in this guild.`);
  process.exit(1);
}
await putOverwrite(rulesCh.id, everyoneRoleId, everyoneRulesAllow, everyoneRulesDeny);
await putOverwrite(rulesCh.id, verifiedRoleId, verifiedChannelBits, allowNone);
if (!DRY) await sleep(200);

// 2) All other channels & categories: hide from @everyone, open for Verified
let n = 2;
for (const ch of ordered) {
  if (ch.id === rulesChannelId) continue;
  await putOverwrite(ch.id, everyoneRoleId, allowNone, denyViewEveryone);
  await putOverwrite(ch.id, verifiedRoleId, verifiedChannelBits, allowNone);
  n += 2;
  if (!DRY) await sleep(200);
}

console.log(
  DRY
    ? `[dry-run] Would update ${ordered.length} channels/categories × 2 overwrites.`
    : `Done. Updated ${ordered.length} channels/categories (everyone + Verified).`
);
