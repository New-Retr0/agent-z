type DiscordComponent = Record<string, unknown>;

type DiscordAllowedMentions = {
  parse?: string[];
  users?: string[];
  roles?: string[];
  replied_user?: boolean;
};

export function formatDiscordChunks(text: string, options?: { header?: string }): string[] {
  const header = options?.header ?? "";
  const limit = 1900;
  const body = text.trim() || "(no output)";
  const chunks: string[] = [];
  let remaining = `${header}${body}`;
  while (remaining.length > limit) {
    let splitAt = remaining.lastIndexOf("\n", limit);
    if (splitAt < Math.max(500, limit - 400)) {
      splitAt = limit;
    }
    chunks.push(remaining.slice(0, splitAt).trimEnd());
    remaining = remaining.slice(splitAt).trimStart();
  }
  chunks.push(remaining);
  return chunks;
}

export async function editOriginalInteraction(
  applicationId: string,
  interactionToken: string,
  content: string,
  options?: { flags?: number; components?: DiscordComponent[] }
) {
  const response = await fetch(`https://discord.com/api/v10/webhooks/${applicationId}/${interactionToken}/messages/@original`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      content,
      flags: options?.flags ?? 0,
      components: options?.components ?? [],
    }),
  });
  if (!response.ok) {
    throw new Error(`Discord edit original failed: ${response.status} ${await response.text()}`);
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
