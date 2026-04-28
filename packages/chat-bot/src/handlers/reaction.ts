import type { Chat } from "chat";

/**
 * Reaction automation needs Gateway forwarding plus explicit role policy. Leave this inert until enabled.
 */
export function onReaction(bot: Chat) {
  bot.onReaction(["white_check_mark", "✅"], async (event) => {
    console.info("[chat-bot] reaction automation is disabled", {
      emoji: event.rawEmoji,
    });
  });
}
