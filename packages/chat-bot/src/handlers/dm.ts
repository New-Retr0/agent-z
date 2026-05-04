import type { Chat } from "chat";

/**
 * DMs: serverless bot is guild-only; reply with guidance.
 */
export function onDirectMessage(bot: Chat) {
  bot.onDirectMessage(async (thread) => {
    await thread.post(
      "Agent Z runs in the server only — use a channel in the community, not a DM to the bot."
    );
  });
}
