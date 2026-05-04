/**
 * Oversight ingest endpoint.
 *
 * The gateway relay (apps/gateway) POSTs raw MESSAGE_CREATE / MESSAGE_UPDATE /
 * MESSAGE_DELETE Discord Gateway events here. We:
 *   1) verify the relay token matches DISCORD_BOT_TOKEN (only our gateway
 *      should be able to publish into the archive),
 *   2) upsert the row in the `message` table,
 *   3) push the message id onto the Redis Streams embed queue for the
 *      cron worker to pick up.
 *
 * This route is intentionally separate from `/api/discord` so it can be
 * called only by the gateway, never by Discord directly. There is no
 * Ed25519 verification because Discord's Interactions service does not call
 * this endpoint; only the gateway does.
 */

import { NextResponse } from "next/server";
import { after } from "next/server";
import {
  enqueueEmbed,
  markMessageDeleted,
  markMessageEdited,
  upsertIncomingMessage,
  type IncomingMessage,
  type MessageAttachment,
} from "@repo/db";

export const runtime = "nodejs";

type OversightEnvelope = {
  type: string;
  timestamp?: number;
  data?: unknown;
};

export async function POST(request: Request) {
  const expectedToken = process.env.DISCORD_BOT_TOKEN?.trim();
  if (!expectedToken) {
    return NextResponse.json(
      { error: "DISCORD_BOT_TOKEN is not configured." },
      { status: 503 }
    );
  }
  const presentedToken = request.headers.get("x-discord-gateway-token")?.trim();
  if (presentedToken !== expectedToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let envelope: OversightEnvelope;
  try {
    envelope = (await request.json()) as OversightEnvelope;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const data = isRecord(envelope.data) ? envelope.data : null;
  if (!data) {
    return NextResponse.json({ ok: true, ignored: "empty payload" });
  }

  switch (envelope.type) {
    case "GATEWAY_MESSAGE_CREATE": {
      const message = parseMessageCreate(data);
      if (!message) {
        return NextResponse.json({ ok: true, ignored: "unparseable message" });
      }
      after(handleMessageCreate(message));
      return NextResponse.json({ ok: true, queued: message.id });
    }
    case "GATEWAY_MESSAGE_UPDATE": {
      const id = stringProp(data, "id");
      const editedAtRaw = stringProp(data, "edited_timestamp");
      const content = stringProp(data, "content") ?? "";
      if (!id || !editedAtRaw) {
        return NextResponse.json({ ok: true, ignored: "missing id/edited_at" });
      }
      after(handleMessageUpdate({ id, content, editedAt: new Date(editedAtRaw) }));
      return NextResponse.json({ ok: true, edited: id });
    }
    case "GATEWAY_MESSAGE_DELETE": {
      const id = stringProp(data, "id");
      if (!id) return NextResponse.json({ ok: true, ignored: "missing id" });
      after(handleMessageDelete({ id }));
      return NextResponse.json({ ok: true, deleted: id });
    }
    default:
      return NextResponse.json({ ok: true, ignored: envelope.type });
  }
}

async function handleMessageCreate(message: IncomingMessage) {
  try {
    const isNew = await upsertIncomingMessage(message);
    if (isNew && message.content.trim()) {
      await enqueueEmbed(message.id);
    }
  } catch (error) {
    console.error("[oversight] upsert failed", message.id, error);
  }
}

async function handleMessageUpdate(args: { id: string; content: string; editedAt: Date }) {
  try {
    await markMessageEdited(args);
    if (args.content.trim()) {
      await enqueueEmbed(args.id);
    }
  } catch (error) {
    console.error("[oversight] edit failed", args.id, error);
  }
}

async function handleMessageDelete(args: { id: string }) {
  try {
    await markMessageDeleted({ id: args.id, deletedAt: new Date() });
  } catch (error) {
    console.error("[oversight] delete failed", args.id, error);
  }
}

function parseMessageCreate(data: Record<string, unknown>): IncomingMessage | null {
  const id = stringProp(data, "id");
  const channelId = stringProp(data, "channel_id");
  const author = recordProp(data, "author");
  const authorId = stringProp(author, "id");
  if (!id || !channelId || !authorId) {
    return null;
  }

  const sentAtRaw = stringProp(data, "timestamp");
  const sentAt = sentAtRaw ? new Date(sentAtRaw) : new Date();

  const referencedMessage = recordProp(data, "referenced_message");
  const attachmentsRaw = Array.isArray(data.attachments) ? data.attachments : [];
  const attachments: MessageAttachment[] = attachmentsRaw.flatMap((entry) =>
    isRecord(entry)
      ? [
          {
            id: stringProp(entry, "id"),
            filename: stringProp(entry, "filename"),
            url: stringProp(entry, "url"),
            content_type: stringProp(entry, "content_type"),
            size: typeof entry.size === "number" ? entry.size : undefined,
          },
        ]
      : []
  );

  const mentions = Array.isArray(data.mentions) ? data.mentions : [];
  const mentionUserIds = mentions.flatMap((m) =>
    isRecord(m)
      ? [stringProp(m, "id")].filter((id): id is string => Boolean(id))
      : []
  );

  return {
    id,
    channelId,
    guildId: stringProp(data, "guild_id") ?? null,
    authorId,
    authorName: stringProp(author, "username") ?? stringProp(author, "global_name") ?? null,
    authorIsBot: Boolean(author && (author as { bot?: unknown }).bot),
    content: stringProp(data, "content") ?? "",
    referencedMessageId: stringProp(referencedMessage, "id") ?? null,
    attachments,
    mentionUserIds,
    sentAt,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function recordProp(value: unknown, key: string): Record<string, unknown> | undefined {
  if (!isRecord(value)) return undefined;
  const v = value[key];
  return isRecord(v) ? v : undefined;
}

function stringProp(value: unknown, key: string): string | undefined {
  if (!isRecord(value)) return undefined;
  const v = value[key];
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}
