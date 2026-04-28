import { Chat } from "chat";
import { createDiscordAdapter } from "@chat-adapter/discord";
import { createPostgresState } from "@chat-adapter/state-pg";

import { registerHandlers } from "./handlers/index";

function requireEnv(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`Missing required env: ${name}`);
  return v;
}

let _bot: Chat | undefined;

/**
 * Webhook entrypoint: `getBot().webhooks.discord(request)` in `apps/web`.
 * Lazily constructed so `next build` can analyze routes without DB/Discord in env.
 */
export function getBot(): Chat {
  if (_bot) return _bot;
  const publicKey = requireEnv("DISCORD_PUBLIC_KEY");
  const applicationId = requireEnv("DISCORD_APPLICATION_ID");
  const botToken = requireEnv("DISCORD_BOT_TOKEN");
  const databaseUrl = requireEnv("DATABASE_URL");

  _bot = new Chat({
    userName: "Agent Z",
    adapters: {
      discord: createDiscordAdapter({ publicKey, applicationId, botToken }),
    },
    state: createPostgresState({ url: databaseUrl }),
    dedupeTtlMs: 600_000,
  }).registerSingleton();
  registerHandlers(_bot);
  return _bot;
}
