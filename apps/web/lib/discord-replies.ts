type DiscordComponent = Record<string, unknown>;

type DiscordAllowedMentions = {
  parse?: string[];
  users?: string[];
  roles?: string[];
  replied_user?: boolean;
};

/** Discord hard limit per message; we stay slightly under for mentions / formatting headroom. */
export const DISCORD_MESSAGE_SAFE_CHUNK = 1900;

/** Total reply length for model output + history (before splitting into Discord messages). */
export const DISCORD_PUBLIC_REPLY_MAX_CHARS = 4_000;
export const DISCORD_ADMIN_REPLY_MAX_CHARS = 7_000;

const TRUNCATION_FOOTER =
  "\n\n_(Truncated — ask a follow-up if you need more detail.)_";

/** Shorten text for Discord delivery and conversation history (keeps paragraph breaks when possible). */
export function truncateDiscordReply(text: string, maxChars: number): string {
  const t = text.trim();
  if (t.length <= maxChars) {
    return t;
  }
  const budget = maxChars - TRUNCATION_FOOTER.length;
  if (budget < 200) {
    return `${t.slice(0, maxChars - TRUNCATION_FOOTER.length).trimEnd()}${TRUNCATION_FOOTER}`;
  }
  let cut = t.slice(0, budget);
  const para = cut.lastIndexOf("\n\n");
  const line = cut.lastIndexOf("\n");
  const sentence = cut.lastIndexOf(". ");
  const breakAt = Math.max(
    para > budget * 0.55 ? para : -1,
    line > budget * 0.65 ? line : -1,
    sentence > budget * 0.65 ? sentence + 1 : -1
  );
  if (breakAt > 0) {
    cut = t.slice(0, breakAt).trimEnd();
  } else {
    cut = cut.trimEnd();
  }
  return `${cut}${TRUNCATION_FOOTER}`;
}

export type FormatDiscordChunksOptions = {
  header?: string;
  /** Hard cap on body characters before chunking (after optional header). */
  maxTotalChars?: number;
  /** Max messages to split into (including the first). Extra content is trimmed, not posted. */
  maxChunks?: number;
  /** Per-message character target (Discord max is 2000). */
  chunkLimit?: number;
};

/** Allow `<@userId>` in message body to render as a real mention for this user (Discord suppresses pings without this). */
export function discordAllowedMentionsForUsers(userIds: string[]): DiscordAllowedMentions {
  const users = userIds.filter((id) => id.trim().length > 0);
  if (users.length === 0) {
    return { parse: [] };
  }
  return { parse: [], users };
}

export function formatDiscordChunks(text: string, options?: FormatDiscordChunksOptions): string[] {
  const header = options?.header ?? "";
  const maxTotalChars = options?.maxTotalChars ?? 4_500;
  const maxChunks = Math.max(1, options?.maxChunks ?? 3);
  const limit = options?.chunkLimit ?? DISCORD_MESSAGE_SAFE_CHUNK;

  let body = text.trim() || "(no output)";
  if (body.length > maxTotalChars) {
    body = truncateDiscordReply(body, maxTotalChars);
  }

  const out: string[] = [];
  let remaining = `${header}${body}`;

  while (remaining.length > limit && out.length < maxChunks - 1) {
    let splitAt = remaining.lastIndexOf("\n", limit);
    if (splitAt < Math.max(500, limit - 400)) {
      splitAt = limit;
    }
    out.push(remaining.slice(0, splitAt).trimEnd());
    remaining = remaining.slice(splitAt).trimStart();
  }

  if (remaining.length > 0) {
    out.push(remaining.length > limit ? truncateDiscordReply(remaining, limit) : remaining);
  }
  if (out.length === 0) {
    out.push(header + body);
  }
  return out;
}

/**
 * Updates the initial interaction response (`@original`). Content is clipped to Discord's 2000-char limit.
 * No-ops when application id or token is missing (mirrors webhook-style callers that tolerate partial config).
 */
export async function editOriginalInteraction(
  applicationId: string | undefined,
  interactionToken: string | undefined,
  content: string,
  options?: {
    flags?: number;
    components?: DiscordComponent[];
    allowedMentions?: DiscordAllowedMentions;
    /** When set, Discord embeds are sent (content may be empty if embeds carry the message). */
    embeds?: unknown[];
  }
) {
  if (!applicationId || !interactionToken) {
    return;
  }
  const safe = content.slice(0, 2000);
  const body: Record<string, unknown> = {
    content: safe,
    flags: options?.flags ?? 0,
    components: options?.components ?? [],
    allowed_mentions: options?.allowedMentions ?? { parse: [] },
  };
  if (options?.embeds && options.embeds.length > 0) {
    body.embeds = options.embeds;
  }
  const response = await fetch(`https://discord.com/api/v10/webhooks/${applicationId}/${interactionToken}/messages/@original`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    console.error(`Discord edit original failed: ${response.status} ${await response.text()}`);
  }
}

/** Additional channel messages after the initial interaction response (same interaction token). */
export async function postDiscordInteractionFollowup(
  applicationId: string | undefined,
  interactionToken: string | undefined,
  content: string,
  options?: {
    flags?: number;
    allowedMentions?: DiscordAllowedMentions;
    embeds?: unknown[];
    components?: DiscordComponent[];
  }
) {
  if (!applicationId || !interactionToken) {
    return;
  }
  const safe = content.slice(0, 2000);
  const payload: Record<string, unknown> = {
    content: safe,
    flags: options?.flags ?? 0,
    allowed_mentions: options?.allowedMentions ?? { parse: [] },
  };
  if (options?.embeds && options.embeds.length > 0) {
    payload.embeds = options.embeds;
  }
  if (options?.components && options.components.length > 0) {
    payload.components = options.components;
  }
  const response = await fetch(`https://discord.com/api/v10/webhooks/${applicationId}/${interactionToken}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    console.error(`Discord interaction followup failed: ${response.status} ${await response.text()}`);
  }
}

export async function postDiscordChannelMessage(
  channelId: string,
  content: string,
  options?: {
    messageId?: string;
    components?: DiscordComponent[];
    allowedMentions?: DiscordAllowedMentions;
  }
) {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) {
    throw new Error("DISCORD_BOT_TOKEN is required to post Discord channel messages");
  }

  const body: Record<string, unknown> = {
    content,
    allowed_mentions: options?.allowedMentions ?? { parse: [] },
  };
  if (options?.messageId) {
    body.message_reference = { message_id: options.messageId, channel_id: channelId, fail_if_not_exists: false };
  }
  if (options?.components) {
    body.components = options.components;
  }

  const response = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
    method: "POST",
    headers: {
      authorization: `Bot ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`Discord channel message failed: ${response.status} ${await response.text()}`);
  }
}
