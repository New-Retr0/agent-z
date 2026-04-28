import type { Chat } from "chat";
import { getMentionDiscordContext } from "../discord-context";
import { invokeAgentWorkflow } from "../invoke-workflow";

export function onMention(bot: Chat) {
  bot.onNewMention(async (thread, message) => {
    const text = message.text?.trim() ?? "";
    const prompt = text.replace(/<@!?\d+>/g, "").trim() || "Hello";
    const uid = message.author.userId;
    try {
      const { runId, agentRunId, tier } = await invokeAgentWorkflow({
        prompt,
        invokerUserId: uid,
        discordContext: getMentionDiscordContext(thread, message),
        replyTarget: thread.toJSON(),
      });
      await thread.post(
        `Started Agent Z with \`${tier}\` access (workflow \`${runId}\`, \`${agentRunId.slice(0, 8)}...\`). I will post the final answer in this thread.`
      );
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      await thread.post(`Could not start agent: ${err}`);
    }
  });
}
