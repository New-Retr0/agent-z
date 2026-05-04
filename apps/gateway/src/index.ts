import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ActivityType, Client, Events, GatewayIntentBits, Partials } from "discord.js";
import { config } from "dotenv";

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = join(here, "..");
const repoRoot = join(appRoot, "..", "..");

config({ path: join(repoRoot, ".env") });
config({ path: join(appRoot, ".env"), override: true });

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
  referenced_message?: {
    author?: {
      id?: string;
    } | null;
  } | null;
  is_mention?: boolean;
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
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.DirectMessageReactions,
    ...(useMessageContent ? [GatewayIntentBits.MessageContent] : []),
  ],
  partials: [Partials.Channel, Partials.Message, Partials.Reaction],
});

function resolveBotUserSnowflake(): string {
  return client.user?.id ?? botUserIdCached ?? "";
}

client.once(Events.ClientReady, (readyClient) => {
  readyClient.user.setActivity(activity, { type: ActivityType.Custom });
  console.log(`[Agent Z Gateway] online as ${readyClient.user.tag}`);
  console.log(`[Agent Z Gateway] forwarding Discord Gateway events to ${appBaseUrl}/api/discord`);
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
  console.error("[Agent Z Gateway] Discord client error", error);
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

  const data = normalizeGatewayData(eventType, packet.d);
  if (eventType === "MESSAGE_CREATE" && isBotMessage(data)) {
    return;
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

  if (!isReplyToAgentZ && !mentionsAgentZ) {
    return data;
  }

  return {
    ...message,
    is_mention: true,
  };
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

client.login(token);

