import type { Chat } from "chat";

/**
 * Admin confirm/deny for queued destructive Discord actions is handled directly in
 * `apps/web/app/api/discord/route.ts` (`azconfirm:` / `azcancel:` components). This handler is a no-op placeholder.
 */
export function onAction(bot: Chat) {
  bot.onAction(async (event) => {
    if (!event.actionId?.startsWith("confirm:") || !event.thread) {
      return;
    }
    // Confirms are native Discord MessageComponent (`azconfirm:`) in route.ts, not Chat SDK action ids.
  });
}
