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
const applicationId = requireEnv("DISCORD_APPLICATION_ID");
const appBaseUrl = requireEnv("AGENT_Z_APP_BASE_URL").replace(/\/$/, "");
const activity = process.env.AGENT_Z_GATEWAY_ACTIVITY?.trim() || "Agent Z";

const forwardedEvents = new Set(["MESSAGE_CREATE", "MESSAGE_REACTION_ADD", "MESSAGE_REACTION_REMOVE"]);
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

/**
 * This optional Gateway process is intentionally thin: it receives raw Discord
 * Gateway events and forwards them to the Vercel-hosted Chat SDK webhook.
 * Main Agent Z behavior stays in apps/web.
 */
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.DirectMessageReactions,
  ],
  partials: [Partials.Channel, Partials.Message, Partials.Reaction],
});

client.once(Events.ClientReady, (readyClient) => {
  readyClient.user.setActivity(activity, { type: ActivityType.Custom });
  console.log(`[Agent Z Gateway] online as ${readyClient.user.tag}`);
  console.log(`[Agent Z Gateway] forwarding Discord Gateway events to ${appBaseUrl}/api/discord`);
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
  if (!eventType || !forwardedEvents.has(eventType)) {
    return;
  }

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
  const isReplyToAgentZ = message.referenced_message?.author?.id === applicationId;
  const mentionsAgentZ = Boolean(
    applicationId &&
      (message.mentions?.some((mention) => mention.id === applicationId) ||
        message.content?.includes(`<@${applicationId}>`) ||
        message.content?.includes(`<@!${applicationId}>`))
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

async function forwardGatewayEvent(event: { type: string; timestamp: number; data: unknown }) {
  const message = summarizeEvent(event.data);
  for (let attempt = 1; attempt <= maxForwardAttempts; attempt += 1) {
    try {
      const response = await fetch(`${appBaseUrl}/api/discord`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-discord-gateway-token": token,
        },
        body: JSON.stringify(event),
      });

      console.log("[Agent Z Gateway] forwarded event", {
        type: event.type,
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

