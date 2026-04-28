import { getBot } from "@repo/chat-bot";
import { after, NextResponse } from "next/server";

export const runtime = "nodejs";

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
    const bot = getBot();
    return bot.webhooks.discord(request, { waitUntil: (p) => after(p) });
  } catch (error) {
    console.error("[api/discord] webhook failed", error);
    return NextResponse.json({ error: "Discord webhook failed" }, { status: 500 });
  }
}
