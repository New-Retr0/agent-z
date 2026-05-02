import type { Chat } from "chat";
import { getSlashDiscordContext, getSlashReplyTarget } from "../discord-context";
import { invokeAgentWorkflow } from "../invoke-workflow";

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
      await invokeAgentWorkflow({
        prompt: args,
        invokerUserId: event.user.userId,
        discordContext: getSlashDiscordContext(event),
        replyTarget: getSlashReplyTarget(event),
        maxTier: "verified",
      });
      await event.channel.post({
        markdown: "**Agent Z** is thinking. I'll reply here when I finish.",
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await event.channel.post({ markdown: `**Agent Z** could not start: ${msg}` });
    }
  });
  bot.onSlashCommand("help", async (event) => {
    await event.channel.post({
      markdown:
        "Commands: `/agent-z text:<question>` for normal help, `/agent-z-admin action:<staff request>` for private mod/admin runs. Admins configure roles and channels in `/admin/config`.",
    });
  });
}
