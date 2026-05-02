import { getBot } from "@repo/chat-bot";
import { after, NextResponse } from "next/server";
import { verifyKey } from "discord-interactions";

export const runtime = "nodejs";

const INTERACTION_TYPE = {
  Ping: 1,
  ApplicationCommand: 2,
} as const;

const RESPONSE_TYPE = {
  Pong: 1,
  DeferredChannelMessageWithSource: 5,
} as const;

const EPHEMERAL_FLAG = 64;

/**
 * Discord Interactions + webhooks. Point the **Interactions endpoint** (and related URLs) to this path on your deployment.
 */
export async function POST(request: Request) {
  const missing = ["DISCORD_PUBLIC_KEY", "DISCORD_APPLICATION_ID", "DISCORD_BOT_TOKEN", "DATABASE_URL"].filter(
    (name) => !process.env[name]?.trim()
  );
  if (missing.length > 0) {
    return NextResponse.json(
      { error: "Discord webhook is not configured", missing },
      { status: 503 }
    );
  }

  try {
    const bodyBytes = new Uint8Array(await request.arrayBuffer());
    const bodyText = new TextDecoder().decode(bodyBytes);
    const interaction = parseInteraction(bodyText);

    if (interaction?.type === INTERACTION_TYPE.Ping) {
      const signatureValid = await verifyDiscordSignature(request, bodyBytes);
      if (!signatureValid) {
        return new Response("Invalid signature", { status: 401 });
      }
      return NextResponse.json({ type: RESPONSE_TYPE.Pong });
    }

    if (isAgentZAdminInteraction(interaction)) {
      const signatureValid = await verifyDiscordSignature(request, bodyBytes);
      if (!signatureValid) {
        return new Response("Invalid signature", { status: 401 });
      }
      after(handleAgentZAdminInteraction(interaction, request));
      return NextResponse.json({
        type: RESPONSE_TYPE.DeferredChannelMessageWithSource,
        data: { flags: EPHEMERAL_FLAG },
      });
    }

    const bot = getBot();
    return bot.webhooks.discord(cloneRequestWithBody(request, bodyBytes), { waitUntil: (p) => after(p) });
  } catch (error) {
    console.error("[api/discord] webhook failed", error);
    return NextResponse.json({ error: "Discord webhook failed" }, { status: 500 });
  }
}

function cloneRequestWithBody(request: Request, body: Uint8Array) {
  const copy = new Uint8Array(body);
  return new Request(request.url, {
    method: request.method,
    headers: request.headers,
    body: copy.buffer as ArrayBuffer,
  });
}

function parseInteraction(body: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(body);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

async function verifyDiscordSignature(request: Request, bodyBytes: Uint8Array) {
  const signature = request.headers.get("x-signature-ed25519");
  const timestamp = request.headers.get("x-signature-timestamp");
  const publicKey = process.env.DISCORD_PUBLIC_KEY;
  if (!signature || !timestamp || !publicKey) {
    return false;
  }
  try {
    return await verifyKey(bodyBytes, signature, timestamp, publicKey);
  } catch {
    return false;
  }
}

function isAgentZAdminInteraction(interaction: Record<string, unknown> | null): interaction is Record<string, unknown> {
  if (!interaction || interaction.type !== INTERACTION_TYPE.ApplicationCommand) {
    return false;
  }
  const data = interaction.data;
  return Boolean(data && typeof data === "object" && !Array.isArray(data) && (data as Record<string, unknown>).name === "agent-z-admin");
}

async function handleAgentZAdminInteraction(interaction: Record<string, unknown>, request: Request) {
  const applicationId = process.env.DISCORD_APPLICATION_ID?.trim();
  const internalSecret = process.env.AGENT_Z_INTERNAL_SECRET?.trim();
  const token = stringProp(interaction, "token");
  const action = extractSlashText(interaction).trim();
  const invokerUserId = extractInvokerUserId(interaction);

  if (!applicationId || !internalSecret || !token) {
    await editOriginalInteraction(applicationId, token, "**Agent Z admin** is not configured.");
    return;
  }
  if (!action || !invokerUserId) {
    await editOriginalInteraction(applicationId, token, "Use `/agent-z-admin action:<staff request>`.");
    return;
  }

  try {
    const response = await fetch(new URL("/api/workflow/invoke", request.url), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${internalSecret}`,
      },
      body: JSON.stringify({
        prompt: action,
        invokerUserId,
        discordContext: getNativeDiscordContext(interaction),
        replyTarget: {
          _type: "discord:Interaction",
          applicationId,
          interactionToken: token,
        },
        requiredTier: "mod",
      }),
    });
    const payload = await readJson(response);
    if (!response.ok) {
      await editOriginalInteraction(applicationId, token, `**Agent Z admin** could not start: ${payload.error ?? response.status}`);
      return;
    }
    await editOriginalInteraction(
      applicationId,
      token,
      `**Agent Z admin** started with \`${payload.tier ?? "staff"}\` access (workflow \`${payload.runId ?? "unknown"}\`, run \`${String(payload.agentRunId ?? "").slice(0, 8)}...\`). I will post the final answer here privately.`
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await editOriginalInteraction(applicationId, token, `**Agent Z admin** could not start: ${message}`);
  }
}

async function editOriginalInteraction(applicationId: string | undefined, interactionToken: string | undefined, content: string) {
  if (!applicationId || !interactionToken) {
    return;
  }
  const response = await fetch(`https://discord.com/api/v10/webhooks/${applicationId}/${interactionToken}/messages/@original`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      content: content.slice(0, 1900),
      flags: EPHEMERAL_FLAG,
      allowed_mentions: { parse: [] },
    }),
  });
  if (!response.ok) {
    console.error("[api/discord] edit original interaction failed", response.status, await response.text());
  }
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return text ? { error: text } : {};
  }
}

function getNativeDiscordContext(interaction: Record<string, unknown>) {
  const member = recordProp(interaction, "member");
  return {
    guildId: stringProp(interaction, "guild_id"),
    channelId: stringProp(interaction, "channel_id"),
    roleIds: arrayOfStrings(member?.roles),
    isDirectMessage: !stringProp(interaction, "guild_id"),
  };
}

function extractInvokerUserId(interaction: Record<string, unknown>) {
  const memberUser = recordProp(recordProp(interaction, "member"), "user");
  const directUser = recordProp(interaction, "user");
  return stringProp(memberUser, "id") || stringProp(directUser, "id");
}

function extractSlashText(interaction: Record<string, unknown>) {
  const data = recordProp(interaction, "data");
  const options = Array.isArray(data?.options) ? data.options : [];
  return options
    .map((option) => (option && typeof option === "object" && "value" in option ? String((option as { value: unknown }).value) : ""))
    .filter(Boolean)
    .join(" ");
}

function recordProp(value: unknown, key: string): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const prop = (value as Record<string, unknown>)[key];
  return prop && typeof prop === "object" && !Array.isArray(prop) ? (prop as Record<string, unknown>) : undefined;
}

function stringProp(value: unknown, key: string): string | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const prop = (value as Record<string, unknown>)[key];
  return typeof prop === "string" && prop.trim() ? prop.trim() : undefined;
}

function arrayOfStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}
