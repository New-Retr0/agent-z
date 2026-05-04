import type { Chat } from "chat";
import { invokeVerify } from "../invoke-verify";

/**
 * Verify-on-reaction. Listens to the configured emoji (default ✅) on any
 * message in the configured verify channel/message, then asks /api/discord/verify
 * to grant the verified role + DM the welcome template + write a
 * VerificationGrant audit row.
 *
 * The chat-bot adapter only delivers reactions when the gateway is forwarding
 * MESSAGE_REACTION_ADD events (already enabled in apps/gateway). Filtering by
 * channel/message/emoji happens server-side in verifyUserFromReaction so we
 * stay tolerant of stale runtime config.
 */
export function onReaction(bot: Chat) {
  bot.onReaction(async (event) => {
    if (!event.added) return;
    if (event.user.isBot === true) return;

    // Discord thread id is `discord:{guildId}:{channelId}` — split it out.
    const parts = event.threadId.split(":");
    if (parts[0] !== "discord" || parts.length < 3) return;
    const guildId = parts[1] ?? "";
    const channelId = parts[2] ?? "";
    if (!guildId || !channelId) return;

    try {
      const outcome = await invokeVerify({
        guildId,
        channelId,
        messageId: event.messageId,
        userId: event.user.userId,
        emoji: event.rawEmoji,
      });
      if (outcome.kind !== "granted" && outcome.kind !== "already-verified") {
        // Skip noisy debug paths (wrong channel/message/emoji); only log errors.
        if (outcome.kind === "error" || outcome.kind === "config-incomplete") {
          console.warn("[chat-bot] verify outcome:", outcome);
        }
      }
    } catch (e) {
      console.error("[chat-bot] verify invoke failed:", e);
    }
  });
}
