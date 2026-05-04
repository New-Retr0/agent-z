import { after, NextResponse } from "next/server";
import { verifyKey } from "discord-interactions";

export const runtime = "nodejs";

const INTERACTION_TYPE = {
  Ping: 1,
  ApplicationCommand: 2,
  MessageComponent: 3,
} as const;

const RESPONSE_TYPE = {
  Pong: 1,
  ChannelMessageWithSource: 4,
  DeferredChannelMessageWithSource: 5,
  DeferredUpdateMessage: 6,
} as const;

const EPHEMERAL_FLAG = 64;

/**
 * Discord Interactions + webhooks. Point the **Interactions endpoint** (and related URLs) to this path on your deployment.
 *
 * Heavy handlers load via dynamic `import()` *after* we ack the interaction so cold starts can stay within Discord's ~3s limit.
 *
 * **PING** (Interactions URL verification in the Developer Portal) only needs `DISCORD_PUBLIC_KEY` — not `DATABASE_URL`.
 * A 503 from missing DB env caused "could not be verified" even when the public key was correct.
 */
const FULL_SETUP_ENV = ["DISCORD_PUBLIC_KEY", "DISCORD_APPLICATION_ID", "DISCORD_BOT_TOKEN", "DATABASE_URL"] as const;

export async function POST(request: Request) {
  try {
    const bodyBytes = new Uint8Array(await request.arrayBuffer());
    const bodyText = new TextDecoder().decode(bodyBytes);
    const interaction = parseInteraction(bodyText);

    if (interaction?.type === INTERACTION_TYPE.Ping) {
      if (!process.env.DISCORD_PUBLIC_KEY?.trim()) {
        return NextResponse.json({ error: "Discord webhook is not configured", missing: ["DISCORD_PUBLIC_KEY"] }, { status: 503 });
      }
      const signatureValid = await verifyDiscordSignature(request, bodyBytes);
      if (!signatureValid) {
        return new Response("Invalid signature", { status: 401 });
      }
      return NextResponse.json({ type: RESPONSE_TYPE.Pong });
    }

    const missing = FULL_SETUP_ENV.filter((name) => !process.env[name]?.trim());
    if (missing.length > 0) {
      return NextResponse.json({ error: "Discord webhook is not configured", missing }, { status: 503 });
    }

    if (interaction?.type === INTERACTION_TYPE.MessageComponent) {
      const signatureValid = await verifyDiscordSignature(request, bodyBytes);
      if (!signatureValid) {
        return new Response("Invalid signature", { status: 401 });
      }
      const cid = extractMessageComponentCustomId(interaction);
      if (cid && (cid.kind === "confirm" || cid.kind === "cancel")) {
        after(async () => {
          const { handlePendingActionComponent } = await import("./interaction-handlers");
          await handlePendingActionComponent(interaction, cid.kind, cid.token);
        });
        return NextResponse.json({
          type: RESPONSE_TYPE.DeferredUpdateMessage,
        });
      }

      const { getBot } = await import("@repo/chat-bot");
      const bot = getBot();
      return bot.webhooks.discord(cloneRequestWithBody(request, bodyBytes), { waitUntil: (p) => after(p) });
    }

    if (isAgentZAdminInteraction(interaction)) {
      const signatureValid = await verifyDiscordSignature(request, bodyBytes);
      if (!signatureValid) {
        return new Response("Invalid signature", { status: 401 });
      }
      after(async () => {
        const { handleAgentZAdminInteraction } = await import("./interaction-handlers");
        await handleAgentZAdminInteraction(interaction);
      });
      return NextResponse.json({
        type: RESPONSE_TYPE.DeferredChannelMessageWithSource,
        data: { flags: EPHEMERAL_FLAG },
      });
    }

    if (isAgentZSlashInteraction(interaction)) {
      const signatureValid = await verifyDiscordSignature(request, bodyBytes);
      if (!signatureValid) {
        return new Response("Invalid signature", { status: 401 });
      }
      after(async () => {
        const { handleAgentZPublicSlashInteraction } = await import("./interaction-handlers");
        await handleAgentZPublicSlashInteraction(interaction);
      });
      return NextResponse.json({
        type: RESPONSE_TYPE.DeferredChannelMessageWithSource,
        data: { flags: 0 },
      });
    }

    const { getBot } = await import("@repo/chat-bot");
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

function isAgentZSlashInteraction(interaction: Record<string, unknown> | null): interaction is Record<string, unknown> {
  if (!interaction || interaction.type !== INTERACTION_TYPE.ApplicationCommand) {
    return false;
  }
  const data = interaction.data;
  return Boolean(data && typeof data === "object" && !Array.isArray(data) && (data as Record<string, unknown>).name === "agent-z");
}

function extractMessageComponentCustomId(
  interaction: Record<string, unknown>
): { kind: "confirm" | "cancel"; token: string } | null {
  const data = interaction["data"];
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return null;
  }
  const raw =
    typeof (data as Record<string, unknown>)["custom_id"] === "string"
      ? String((data as Record<string, unknown>)["custom_id"]).trim()
      : "";
  if (raw.startsWith("azconfirm:")) {
    return { kind: "confirm", token: raw.slice("azconfirm:".length) };
  }
  if (raw.startsWith("azcancel:")) {
    return { kind: "cancel", token: raw.slice("azcancel:".length) };
  }
  return null;
}
