import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ActivityType, Client, Events, GatewayIntentBits, Partials } from "discord.js";
import { config } from "dotenv";

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = join(here, "..");

const runningOnRailway = Boolean(process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PROJECT_ID);

// Secrets live in `apps/gateway/.env` (see `apps/gateway/env/.env.example`). On Railway, use
// injected env vars; never override them with an image-bundled empty `.env`.
config({ path: join(appRoot, ".env"), override: !runningOnRailway });

const token = requireEnv("DISCORD_BOT_TOKEN");
const appBaseUrl = requireEnv("AGENT_Z_APP_BASE_URL").replace(/\/$/, "");
const activity = process.env.AGENT_Z_GATEWAY_ACTIVITY?.trim() || "Agent Z";
const useMessageContent = ["1", "true", "yes", "on"].includes(
  (process.env.AGENT_Z_MESSAGE_CONTENT_INTENT ?? "").trim().toLowerCase()
);

const forwardedEvents = new Set(["MESSAGE_CREATE", "MESSAGE_REACTION_ADD", "MESSAGE_REACTION_REMOVE"]);
const oversightForwardedEvents = new Set(["MESSAGE_CREATE", "MESSAGE_UPDATE", "MESSAGE_DELETE"]);
const oversightEnabled = ["1", "true", "yes", "on"].includes(
  (process.env.AGENT_Z_OVERSIGHT_ENABLED ?? "").trim().toLowerCase()
);
const oversightIncludeBots = ["1", "true", "yes", "on"].includes(
  (process.env.AGENT_Z_OVERSIGHT_INCLUDE_BOTS ?? "").trim().toLowerCase()
);
const maxForwardAttempts = 3;

/** Optional comma-separated Discord role snowflakes: role @mentions trigger Agent Z without @bot user mention. */
function parseMentionRoleAllowlist(raw: string | undefined): Set<string> {
  const ids = new Set<string>();
  if (!raw?.trim()) return ids;
  for (const part of raw.split(",")) {
    const id = part.trim();
    if (/^\d{17,20}$/.test(id)) ids.add(id);
  }
  return ids;
}

const mentionRoleAllowlist = parseMentionRoleAllowlist(process.env.DISCORD_MENTION_ROLE_IDS);

type RawGatewayPacket = {
  t?: string | null;
  d?: unknown;
};

type DiscordMessagePayload = {
  id?: string;
  channel_id?: string;
  guild_id?: string;
  content?: string;
  author?: {
    id?: string;
    bot?: boolean | null;
  };
  mentions?: Array<{ id?: string }>;
  message_reference?: {
    channel_id?: string;
    message_id?: string;
    guild_id?: string;
  } | null;
  referenced_message?: {
    author?: {
      id?: string;
    } | null;
  } | null;
  is_mention?: boolean;
  mention_roles?: string[];
};

type DiscordReactionPayload = {
  user_id?: string;
  user?: {
    id?: string;
    username?: string;
    bot?: boolean | null;
  };
  member?: {
    user?: {
      id?: string;
      username?: string;
      bot?: boolean | null;
    };
  };
};

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required for the Agent Z Gateway relay.`);
  }
  return value;
}

/** Discord closes shards with Error: Used disallowed intents when IDENTIFY intents are not toggled on for this bot in the Developer Portal. */
function logIntentMismatchHints(error: unknown) {
  const msg = error instanceof Error ? error.message : String(error);
  if (!msg.includes("disallowed intents")) {
    return;
  }
  console.error(`[Agent Z Gateway] INTENT MISMATCH:\n`);
  console.error(`  Discord rejected the Gateway connection (${msg}).`);
  console.error(`  • If AGENT_Z_MESSAGE_CONTENT_INTENT is enabled (truthy env), enable "Message Content Intent"`);
  console.error(`    on the same application's bot under Developer Portal → Bot → Privileged Gateway Intents.`);
  console.error(`  • If you intentionally keep Message Content off, unset AGENT_Z_MESSAGE_CONTENT_INTENT (or set it to 0) on your host.\n`);
  console.error(`  See apps/gateway/env/.env.example for details.\n`);
}

/** Discord bot tokens encode the bot user snowflake in the segment before the first `.`. */
function botUserIdFromToken(botToken: string): string | undefined {
  const head = botToken.split(".")[0];
  if (!head) {
    return undefined;
  }
  try {
    const decoded = Buffer.from(head, "base64").toString("utf8").trim();
    return /^\d+$/.test(decoded) ? decoded : undefined;
  } catch {
    return undefined;
  }
}

const botUserIdCached = botUserIdFromToken(token);

/**
 * This optional Gateway process is intentionally thin: it receives raw Discord
 * Gateway events and forwards them to the Vercel-hosted Chat SDK webhook.
 * Main Agent Z behavior stays in apps/web.
 */
const gatewayIntents = [
  GatewayIntentBits.Guilds,
  GatewayIntentBits.GuildMessages,
  GatewayIntentBits.DirectMessages,
  GatewayIntentBits.GuildMessageReactions,
  GatewayIntentBits.DirectMessageReactions,
  ...(useMessageContent ? [GatewayIntentBits.MessageContent] : []),
] as const;

console.log(
  "[Agent Z Gateway] requesting intents: Guilds, GuildMessages, DirectMessages, GuildMessageReactions, DirectMessageReactions" +
    (useMessageContent ? ", MessageContent (privileged)" : " (MessageContent off — set AGENT_Z_MESSAGE_CONTENT_INTENT=1 for mentions/replies that need body text)")
);

const client = new Client({
  intents: [...gatewayIntents],
  partials: [Partials.Channel, Partials.Message, Partials.Reaction],
});

function resolveBotUserSnowflake(): string {
  return client.user?.id ?? botUserIdCached ?? "";
}

client.once(Events.ClientReady, (readyClient) => {
  readyClient.user.setActivity(activity, { type: ActivityType.Custom });
  console.log(`[Agent Z Gateway] online as ${readyClient.user.tag}`);
  console.log(`[Agent Z Gateway] forwarding Discord Gateway events to ${appBaseUrl}/api/discord`);
  if (mentionRoleAllowlist.size > 0) {
    console.log(
      `[Agent Z Gateway] DISCORD_MENTION_ROLE_IDS active (${mentionRoleAllowlist.size} role(s)) — role @mentions trigger without bot user ping`
    );
  }
  if (oversightEnabled) {
    console.log(
      `[Agent Z Gateway] Oversight ingestion ENABLED — also forwarding MESSAGE_CREATE/UPDATE/DELETE to ${appBaseUrl}/api/discord/oversight (include bots: ${oversightIncludeBots})`
    );
  }
  if (!useMessageContent) {
    console.warn("[Agent Z Gateway] Message Content intent is disabled. Reply events can forward, but Discord may omit message text.");
  }
  console.log("[Agent Z Gateway] AI, workflow, database, and admin behavior remain hosted on Vercel.");
});

client.on(Events.Raw, (packet: RawGatewayPacket) => {
  void handleRawPacket(packet);
});

client.on(Events.Error, (error) => {
  logIntentMismatchHints(error);
  console.error("[Agent Z Gateway] Discord client error", error);
});

client.on(Events.ShardError, (error, shardId) => {
  logIntentMismatchHints(error);
  console.error(`[Agent Z Gateway] shard ${shardId} error`, error);
});

async function handleRawPacket(packet: RawGatewayPacket) {
  const eventType = packet.t;
  if (!eventType) return;

  // Oversight tee: forwards EVERY MESSAGE_CREATE/UPDATE/DELETE (optionally
  // including bot output) to /api/discord/oversight independently of the
  // chat-bot mention forwarding below. This populates the message archive.
  if (oversightEnabled && oversightForwardedEvents.has(eventType)) {
    const dataForOversight = packet.d;
    if (
      eventType === "MESSAGE_CREATE" &&
      !oversightIncludeBots &&
      isBotMessage(dataForOversight)
    ) {
      // Skip bot messages when configured.
    } else {
      void forwardGatewayEvent(
        { type: `GATEWAY_${eventType}`, timestamp: Date.now(), data: dataForOversight },
        `${appBaseUrl}/api/discord/oversight`
      );
    }
  }

  if (!forwardedEvents.has(eventType)) return;

  let data = normalizeGatewayData(eventType, packet.d);
  if (eventType === "MESSAGE_CREATE" && isBotMessage(data)) {
    return;
  }
  if (eventType === "MESSAGE_CREATE" && isRecord(data)) {
    data = await ensureMentionFlagForUnresolvedReply(data as DiscordMessagePayload);
  }

  await forwardGatewayEvent({
    type: `GATEWAY_${eventType}`,
    timestamp: Date.now(),
    data,
  });
}

function normalizeGatewayData(eventType: string, data: unknown) {
  if (!isRecord(data)) {
    return data;
  }

  if (eventType === "MESSAGE_REACTION_ADD" || eventType === "MESSAGE_REACTION_REMOVE") {
    return normalizeReactionData(data);
  }

  if (eventType !== "MESSAGE_CREATE") {
    return data;
  }

  const message = data as DiscordMessagePayload;
  const botUserId = resolveBotUserSnowflake();
  if (!botUserId) {
    return data;
  }

  const isReplyToAgentZ = message.referenced_message?.author?.id === botUserId;
  const mentionsAgentZ = Boolean(
    message.mentions?.some((mention) => mention.id === botUserId) ||
      message.content?.includes(`<@${botUserId}>`) ||
      message.content?.includes(`<@!${botUserId}>`)
  );

  const mentionsConfiguredRole =
    mentionRoleAllowlist.size > 0 &&
    Array.isArray(message.mention_roles) &&
    message.mention_roles.some((roleId) => mentionRoleAllowlist.has(roleId));

  if (!isReplyToAgentZ && !mentionsAgentZ && !mentionsConfiguredRole) {
    return data;
  }

  return {
    ...message,
    is_mention: true,
  };
}

/**
 * Discord often omits `referenced_message` on MESSAGE_CREATE even when the user
 * used "Reply". Without `is_mention`, apps/web never treats the message as a bot trigger.
 */
async function ensureMentionFlagForUnresolvedReply(message: DiscordMessagePayload): Promise<DiscordMessagePayload> {
  if (message.is_mention) {
    return message;
  }
  const botUserId = resolveBotUserSnowflake();
  if (!botUserId) {
    return message;
  }
  const ref = message.message_reference;
  const refMessageId = typeof ref?.message_id === "string" ? ref.message_id : undefined;
  const refChannelId =
    typeof ref?.channel_id === "string"
      ? ref.channel_id
      : typeof message.channel_id === "string"
        ? message.channel_id
        : undefined;
  if (!refMessageId || !refChannelId) {
    return message;
  }
  if (message.referenced_message?.author?.id === botUserId) {
    return { ...message, is_mention: true };
  }
  try {
    const response = await fetch(
      `https://discord.com/api/v10/channels/${refChannelId}/messages/${refMessageId}`,
      {
        headers: {
          Authorization: `Bot ${token}`,
        },
      }
    );
    if (!response.ok) {
      return message;
    }
    const parent = (await response.json()) as { author?: { id?: string; bot?: boolean | null } };
    if (parent.author?.id === botUserId) {
      return { ...message, is_mention: true };
    }
  } catch {
    // non-fatal; forward raw payload
  }
  return message;
}

function normalizeReactionData(data: Record<string, unknown>) {
  const reaction = data as DiscordReactionPayload;
  const user = reaction.user ?? reaction.member?.user;
  if (user || !reaction.user_id) {
    return data;
  }

  return {
    ...reaction,
    user: {
      id: reaction.user_id,
      username: reaction.user_id,
      bot: false,
    },
  };
}

function isBotMessage(data: unknown) {
  return isRecord(data) && (data as DiscordMessagePayload).author?.bot === true;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

async function forwardGatewayEvent(
  event: { type: string; timestamp: number; data: unknown },
  destination: string = `${appBaseUrl}/api/discord`
) {
  const message = summarizeEvent(event.data);
  for (let attempt = 1; attempt <= maxForwardAttempts; attempt += 1) {
    try {
      const response = await fetch(destination, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-discord-gateway-token": token,
        },
        body: JSON.stringify(event),
      });

      console.log("[Agent Z Gateway] forwarded event", {
        type: event.type,
        destination,
        attempt,
        status: response.status,
        ...message,
      });

      if (response.ok || response.status < 500) {
        return;
      }
    } catch (error) {
      console.error("[Agent Z Gateway] forward failed", {
        type: event.type,
        destination,
        attempt,
        error: error instanceof Error ? error.message : String(error),
        ...message,
      });
    }

    if (attempt < maxForwardAttempts) {
      await sleep(250 * attempt);
    }
  }
}

function summarizeEvent(data: unknown) {
  if (!isRecord(data)) {
    return {};
  }
  return {
    guildId: typeof data.guild_id === "string" ? data.guild_id : undefined,
    channelId: typeof data.channel_id === "string" ? data.channel_id : undefined,
    messageId:
      typeof data.id === "string" ? data.id : typeof data.message_id === "string" ? data.message_id : undefined,
  };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

client.login(token).catch((error) => {
  logIntentMismatchHints(error);
  console.error("[Agent Z Gateway] login failed", error);
  process.exitCode = 1;
});

