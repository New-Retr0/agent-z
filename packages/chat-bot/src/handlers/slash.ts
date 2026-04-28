import type { Chat } from "chat";
import { getSlashDiscordContext } from "../discord-context";
import { invokeAgentWorkflow } from "../invoke-workflow";

export function onSlash(bot: Chat) {
  bot.onSlashCommand("agent-z", async (event) => {
    const args = event.text?.trim() || "help";
    if (args === "help") {
      await event.channel.post({
        markdown:
          "Use `/agent-z <question>` to run the agent. Slash commands work over Discord Interactions; regular mentions and reactions require Gateway forwarding.",
      });
      return;
    }
    try {
      const { runId, agentRunId, tier } = await invokeAgentWorkflow({
        prompt: args,
        invokerUserId: event.user.userId,
        discordContext: getSlashDiscordContext(event),
        replyTarget: event.channel.toJSON(),
      });
      await event.channel.post({
        markdown: `**Agent Z** started with \`${tier}\` access (workflow \`${runId}\`, run \`${agentRunId.slice(0, 8)}...\`). I will post the final answer here when the workflow completes.`,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await event.channel.post({ markdown: `**Agent Z** could not start: ${msg}` });
    }
  });
  bot.onSlashCommand("help", async (event) => {
    await event.channel.post({
      markdown: "Commands: `/agent-z <question>` invokes the agent. Admins configure allowed roles and channels in `/admin/config`.",
    });
  });
}
