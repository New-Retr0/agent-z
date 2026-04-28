import type { Chat } from "chat";

/**
 * Confirmation actions require a signed/admin-mediated resume path; do not resume hooks directly from Discord.
 */
export function onAction(bot: Chat) {
  bot.onAction(async (event) => {
    if (!event.actionId?.startsWith("confirm:") || !event.thread) {
      return;
    }
    await event.thread.post(
      "This confirmation button is not enabled for Discord. Use the admin confirmations page to review and resume workflow hooks."
    );
  });
}
