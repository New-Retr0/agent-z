import type { Chat } from "chat";
import { forgetUser } from "@repo/db";
import { getSlashDiscordContext, getSlashReplyTarget } from "../discord-context";
import { invokeAgentDirect } from "../invoke-direct";

export function onSlash(bot: Chat) {
  bot.onSlashCommand("agent-z", async (event) => {
    const args = event.text?.trim() || "help";
    if (args === "help") {
      await event.channel.post({
        markdown:
          "Use `/agent-z text:<question>` for normal help. Staff can use `/agent-z-admin action:<request>` for private mod/admin runs.",
      });
      return;
    }
    try {
      await invokeAgentDirect({
        prompt: args,
        invokerUserId: event.user.userId,
        discordContext: getSlashDiscordContext(event),
        replyTarget: getSlashReplyTarget(event),
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await event.channel.post({ markdown: `**Agent Z** could not answer: ${msg}` });
    }
  });
  bot.onSlashCommand("help", async (event) => {
    await event.channel.post({
      markdown:
        "Commands: `/agent-z text:<question>` for normal help, `/agent-z-admin action:<staff request>` for private mod/admin runs. Admins configure roles and channels in `/admin/config`.",
    });
  });

  // Self-service GDPR-style erase. Hard-deletes the caller's conversation turns, profile, and any
  // pending scheduled messages they authored. The server-wide message archive (Phase 4) is wiped
  // separately when that schema lands.
  bot.onSlashCommand("forget-me", async (event) => {
    try {
      const summary = await forgetUser(event.user.userId);
      await event.channel.post({
        markdown:
          `**You're forgotten.**\n` +
          `- Deleted ${summary.conversationTurnsDeleted} conversation turn${summary.conversationTurnsDeleted === 1 ? "" : "s"}.\n` +
          `- ${summary.profileDeleted ? "Removed your stored profile." : "No profile to remove."}\n` +
          `- Cancelled ${summary.scheduledMessagesCancelled} pending scheduled message${summary.scheduledMessagesCancelled === 1 ? "" : "s"}.\n\n` +
          `New conversations will be recorded going forward; run \`/forget-me\` again any time.`,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await event.channel.post({
        markdown: `**Forget failed**: ${msg}\n\nIf this keeps happening, contact a server admin.`,
      });
    }
  });
}
