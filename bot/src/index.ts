import { config } from "dotenv";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import {
  ActivityType,
  Client,
  Events,
  GatewayIntentBits,
  Partials,
  Routes,
  type MessageReaction,
  type PartialMessageReaction,
  type PartialUser,
  type User,
} from "discord.js";
import { handleInteractionCreate, handleMessageCreate } from "./agent/handlers.js";
import { upsertAgentZGuildCommands } from "./agent/upsertGuildSlash.js";
import { resolveGuildId } from "./resolveGuildId.js";

/** In-client display name. Set the application/bot name to the same in the Developer Portal. */
const BOT_NAME = "Agent Z";

const here = dirname(fileURLToPath(import.meta.url));
const botRoot = join(here, "..");
const repoRoot = join(botRoot, "..");
config({ path: join(repoRoot, ".env") });
config({ path: join(botRoot, ".env"), override: true });

const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN?.trim();

const GUILD_ID = resolveGuildId();
const MESSAGE_ID = process.env.REACTION_MESSAGE_ID?.trim();
const VERIFIED_ROLE_ID = process.env.REACTION_VERIFIED_ROLE_ID?.trim();
const REACTION_EMOJI = (process.env.REACTION_EMOJI?.trim() || "✅") as string;

if (!DISCORD_BOT_TOKEN) {
  throw new Error("DISCORD_BOT_TOKEN is required (same app token as the MCP, or a dedicated bot).");
}
if (!MESSAGE_ID) {
  throw new Error(
    "REACTION_MESSAGE_ID is required. Post your rules, copy the message link ID, and paste the message snowflake here."
  );
}
if (!VERIFIED_ROLE_ID) {
  throw new Error("REACTION_VERIFIED_ROLE_ID is required (the @Verified or Member role id).");
}

const WELCOME_DM_ENABLED = !["0", "false", "no", "off"].includes(
  (process.env.REACTION_WELCOME_DM_ENABLED ?? "1").trim().toLowerCase()
);
const REACTION_DEBUG = ["1", "true", "yes", "on"].includes(
  (process.env.REACTION_DEBUG ?? "").trim().toLowerCase()
);

function dlog(...x: unknown[]) {
  if (REACTION_DEBUG) console.log(`[${BOT_NAME}][debug]`, ...x);
}
/** Optional override; use `\\n` for newlines. Placeholders: {server} {displayName} {username} {botName} */
const WELCOME_DM_RAW = process.env.REACTION_WELCOME_DM;
const WELCOME_DM_DEFAULT = [
  "## Welcome to **{server}**, {displayName}",
  "You're verified — the rest of the server just opened up for you.",
  "",
  "### Quick orientation",
  "> **Explore** the categories and channels — that's where the real stuff lives.",
  "> **Jump in** when you're ready, or chill and lurk. Both are fine.",
  "> If we use **Channels & Roles**, grab any optional tags that fit you.",
  "",
  "Thanks for reading the rules. See you around.",
  "-# — {botName}",
].join("\n");

type AnyReaction = MessageReaction | PartialMessageReaction;

/**
 * For standard Unicode reactions, Discord uses names like `white_check_mark`, not the literal
 * character, so `REACTION_EMOJI=✅` must also match the API name.
 */
function expandConfiguredEmojiNames(configured: string): string[] {
  const c = configured.trim();
  const s = new Set<string>([c, c.toLowerCase()]);
  if (c === "✅" || c === "\u2705") s.add("white_check_mark");
  if (c === "white_check_mark" || c === ":white_check_mark:") s.add("white_check_mark");
  return [...s].filter(Boolean);
}

/**
 * Match configured env to a partial reaction: unicode name, or custom emoji by id.
 */
function emojiMatches(reaction: AnyReaction, configured: string): boolean {
  const c = configured.trim();
  if (!c) return false;
  const emoji = reaction.emoji;
  if (!emoji) return false;
  if (/^\d{17,20}$/.test(c)) {
    return emoji.id === c;
  }
  const fromDiscordFormat = c.match(/:(\d{17,20})>?\s*$/);
  if (fromDiscordFormat) {
    return emoji.id === fromDiscordFormat[1];
  }
  if (emoji.id) {
    return emoji.id === c;
  }
  const name = emoji.name ?? "";
  return expandConfiguredEmojiNames(c).some((alias) => alias === name);
}

function applyWelcomeTemplate(
  template: string,
  o: { server: string; displayName: string; username: string }
) {
  return template
    .replaceAll("{server}", o.server)
    .replaceAll("{displayName}", o.displayName)
    .replaceAll("{username}", o.username)
    .replaceAll("{botName}", BOT_NAME);
}

/**
 * Open DM and send (REST). Matches the flow used in scripts/send-dm.mjs; more reliable
 * than `User#send` in some client configurations.
 */
async function sendUserDm(client: Client, userId: string, content: string) {
  const ch = (await client.rest.post(Routes.userChannels(), {
    body: { recipient_id: userId },
  })) as { id: string };
  await client.rest.post(Routes.channelMessages(ch.id), {
    body: { content },
  });
}

// Intentionally no GuildMembers here: "Used disallowed intents" if the toggle is
// off in the Developer Portal. Role IDs for the invoking user are taken from
// interaction payloads, message.member when present, or GET /members/{id} in handlers.
const useMessageContent = ["1", "true", "yes", "on"].includes(
  (process.env.AGENT_Z_MESSAGE_CONTENT_INTENT ?? "").trim().toLowerCase()
);
const MENTION_INTENTS: GatewayIntentBits[] = useMessageContent
  ? [GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
  : [];

// When unset: no Message Content / GuildMessages — bot starts without the Message Content
// privileged toggle. Set AGENT_Z_MESSAGE_CONTENT_INTENT=1, enable the toggle in the Dev
// Portal, and restart for @-mention prompts.
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessageReactions,
    ...MENTION_INTENTS,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

function reactionTargetsRulesMessage(
  reaction: AnyReaction,
  user: User | PartialUser
): user is User & { id: string } {
  if (!user.id) return false;
  if (reaction.message.guildId !== GUILD_ID) return false;
  if (reaction.message.id !== MESSAGE_ID) return false;
  return true;
}

const SKIP_SLASH_UPSERT = ["1", "true", "yes", "on"].includes(
  (process.env.AGENT_Z_SKIP_SLASH_UPSERT ?? "").trim().toLowerCase()
);

client.once(Events.ClientReady, (c) => {
  c.user.setActivity(BOT_NAME, { type: ActivityType.Custom });
  const dmNote = WELCOME_DM_ENABLED ? " + welcome DM" : "";
  const dbg = REACTION_DEBUG ? " + REACTION_DEBUG" : "";
  console.log(
    `[${BOT_NAME}] online as ${c.user.tag} — message ${MESSAGE_ID} ${REACTION_EMOJI} → role ${VERIFIED_ROLE_ID} (guild ${GUILD_ID})${dmNote}${dbg}`
  );
  if (REACTION_DEBUG) {
    dlog("Listening for MessageReactionAdd on that message. Set REACTION_DEBUG=0 in production to reduce noise.");
  }
  if (!SKIP_SLASH_UPSERT && DISCORD_BOT_TOKEN) {
    const appId =
      process.env.DISCORD_APPLICATION_ID?.trim() ??
      process.env.DISCORD_CLIENT_ID?.trim() ??
      c.user.id;
    void upsertAgentZGuildCommands({
      token: DISCORD_BOT_TOKEN,
      applicationId: appId,
      guildId: GUILD_ID,
    })
      .then(() => {
        console.log(
          `[${BOT_NAME}] Slash command **/agent-z** is registered in this guild. Type / then **agent** to find it.`
        );
      })
      .catch((err: unknown) => {
        const msg = err && typeof err === "object" && "message" in err ? String((err as Error).message) : String(err);
        console.error(
          `[${BOT_NAME}] Could not register slash commands (${msg}). Re-invite the bot with the **applications.commands** scope, or run: cd bot && npm run register`
        );
      });
  }
});

client.on(Events.MessageReactionAdd, async (reaction, user) => {
  if (user.bot) return;
  if (!emojiMatches(reaction, REACTION_EMOJI)) {
    dlog(
      "emoji no match: got",
      reaction.emoji.id ?? reaction.emoji.name,
      "— expected",
      REACTION_EMOJI
    );
    return;
  }

  try {
    if (reaction.partial) {
      await reaction.fetch();
    }
    if (reaction.message.partial) {
      await reaction.message.fetch();
    }
  } catch (e) {
    console.error("Failed to fetch reaction/message:", e);
    return;
  }

  if (!reactionTargetsRulesMessage(reaction, user)) {
    dlog(
      "not the watched rules message: messageId",
      reaction.message.id,
      "guild",
      reaction.message.guildId,
      "— need message",
      MESSAGE_ID,
      "guild",
      GUILD_ID
    );
    return;
  }

  const memberUser = await client.users.fetch(user.id);
  if (memberUser.bot) return;

  let alreadyVerified = false;
  try {
    const member = (await client.rest.get(
      Routes.guildMember(GUILD_ID, memberUser.id)
    )) as { roles: string[] };
    alreadyVerified = member.roles.includes(VERIFIED_ROLE_ID);
  } catch (e) {
    console.error("Could not load member; skipping verify:", e);
    return;
  }
  if (alreadyVerified) {
    console.log(
      `[${BOT_NAME}] ${memberUser.tag} already has Verified — skipping role add and welcome DM (no duplicate on re-reaction).`
    );
    return;
  }

  try {
    await client.rest.put(Routes.guildMemberRole(GUILD_ID, memberUser.id, VERIFIED_ROLE_ID), {
      body: {},
      reason: "Rules reaction — verified",
    });
  } catch (e) {
    console.error("Could not add Verified role. Is the bot's role ABOVE that role, with Manage Roles?", e);
    return;
  }
  console.log(
    `[${BOT_NAME}] Granted Verified to ${memberUser.tag} (${memberUser.id}). Ensure the "${BOT_NAME}" role is above the Verified role in Server Settings → Roles.`
  );

  if (!WELCOME_DM_ENABLED) return;

  let serverName = "the server";
  try {
    serverName = (await client.guilds.fetch(GUILD_ID)).name;
  } catch {
    // keep placeholder
  }

  const template = (WELCOME_DM_RAW?.trim()
    ? WELCOME_DM_RAW.trim().replace(/\\n/g, "\n")
    : WELCOME_DM_DEFAULT) as string;
  const welcomeText = applyWelcomeTemplate(template, {
    server: serverName,
    displayName: memberUser.globalName ?? memberUser.username,
    username: memberUser.username,
  });

  try {
    await sendUserDm(client, memberUser.id, welcomeText);
    console.log(`[${BOT_NAME}] Welcome DM sent to ${memberUser.tag}.`);
  } catch (e) {
    const err = e as { code?: number; message?: string; rawError?: { message?: string } };
    const code = err.code ?? (e as { status?: number }).status;
    if (code === 50_007) {
      console.log(
        `[${BOT_NAME}] Welcome DM not delivered (user has DMs from server members off, or blocked the bot). Open: User Settings → Privacy → DMs from server members.`
      );
    } else {
      console.error(
        `[${BOT_NAME}] Welcome DM failed:`,
        err.message ?? err.rawError?.message ?? e
      );
    }
  }
});

/**
 * We never remove Verified on un-react. If the role disappears when someone removes ✅,
 * another integration (second bot, Carl-bot, Discord reaction-role app, etc.) is doing it —
 * remove that duplicate from Server Settings → Integrations.
 */
client.on(Events.MessageReactionRemove, async (reaction, user) => {
  if (user.bot) return;
  if (!emojiMatches(reaction, REACTION_EMOJI)) return;
  try {
    if (reaction.partial) await reaction.fetch();
    if (reaction.message.partial) await reaction.message.fetch();
  } catch {
    return;
  }
  if (!reactionTargetsRulesMessage(reaction, user)) return;
  console.log(
    `[${BOT_NAME}] Reaction removed on rules message (user ${user.id}) — this bot does not remove Verified. If the role was removed, check other bots/integrations.`
  );
});

client.on(Events.Error, (e) => {
  console.error("Discord client error:", e);
});

client.on(Events.InteractionCreate, (i) => {
  void handleInteractionCreate(client, i);
});

client.on(Events.MessageCreate, (m) => {
  void handleMessageCreate(client, m);
});

client.login(DISCORD_BOT_TOKEN);
