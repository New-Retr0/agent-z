import { getBot } from "@repo/chat-bot";
import { after } from "next/server";

/**
 * Keeps a Discord Gateway WebSocket open for `durationMs`, forwarding MESSAGE_CREATE (mentions, replies)
 * to `POST /api/discord` so Chat SDK `onNewMention` / `onSubscribedMessage` run on Vercel.
 *
 * Fallback only: the competition path uses the long-lived `apps/gateway` relay instead. Enable this
 * route explicitly with `ENABLE_VERCEL_GATEWAY_LISTENER=true` if you are not running that relay.
 *
 * @see https://www.npmjs.com/package/@chat-adapter/discord — "Gateway setup for serverless"
 */
export const runtime = "nodejs";

/** Pro / Fluid: must exceed listener duration (10m). Hobby plans cannot run long enough for this. */
export const maxDuration = 800;

const LISTENER_MS = 10 * 60 * 1000;

type GatewayDiscordAdapter = {
  startGatewayListener: (
    options: { waitUntil: (task: Promise<unknown>) => void },
    durationMs?: number,
    abortSignal?: AbortSignal,
    webhookUrl?: string
  ) => Promise<Response>;
};

function resolveAppOrigin(): string | null {
  const explicit = process.env.AGENT_Z_APP_BASE_URL?.trim();
  if (explicit) {
    return explicit.replace(/\/$/, "");
  }
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) {
    return `https://${vercel.replace(/^https?:\/\//, "")}`;
  }
  return null;
}

export async function GET(request: Request) {
  if (process.env.ENABLE_VERCEL_GATEWAY_LISTENER !== "true") {
    return new Response(
      "Vercel Gateway listener disabled. Run apps/gateway relay or set ENABLE_VERCEL_GATEWAY_LISTENER=true.",
      { status: 404 }
    );
  }

  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!cronSecret) {
    return new Response("CRON_SECRET is not set (required for Vercel Cron auth)", { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const missing = ["DISCORD_BOT_TOKEN", "DISCORD_PUBLIC_KEY", "DISCORD_APPLICATION_ID", "DATABASE_URL"].filter(
    (name) => !process.env[name]?.trim()
  );
  if (missing.length > 0) {
    return Response.json({ error: "Discord or database env not configured", missing }, { status: 503 });
  }

  const origin = resolveAppOrigin();
  if (!origin) {
    return new Response("Set AGENT_Z_APP_BASE_URL or deploy on Vercel (VERCEL_URL)", { status: 503 });
  }

  const webhookUrl = `${origin}/api/discord`;

  const bot = getBot();
  await bot.initialize();
  const discord = bot.getAdapter("discord") as unknown as GatewayDiscordAdapter | undefined;
  if (!discord?.startGatewayListener) {
    return new Response("Discord adapter does not support Gateway listener", { status: 500 });
  }

  return discord.startGatewayListener({ waitUntil: (p) => after(p) }, LISTENER_MS, undefined, webhookUrl);
}
