import type { Chat, Message, Thread } from "chat";
import { getMentionDiscordContext, getMentionReplyTarget } from "../discord-context";
import { invokeAgentDirect } from "../invoke-direct";

export function onMention(bot: Chat) {
  bot.onNewMention(async (thread, message) => {
    const text = message.text?.trim() ?? "";
    const prompt = text.replace(/<@!?\d+>/g, "").trim() || "Hello";
    await thread.subscribe();
    await invokeFromMessage(thread, message, prompt);
  });

  bot.onSubscribedMessage(async (thread, message) => {
    if (isBotMessage(message)) {
      return;
    }
    const prompt = message.text?.trim();
    if (!prompt) {
      await thread.post(
        "I saw your reply, but Discord did not include the message text. Enable the bot's Message Content Intent in the Discord Developer Portal and set `AGENT_Z_MESSAGE_CONTENT_INTENT=1`, then restart the gateway."
      );
      return;
    }
    await invokeFromMessage(thread, message, prompt);
  });
}

async function invokeFromMessage(thread: Thread, message: Message, prompt: string) {
  const uid = message.author.userId;
  try {
    await invokeAgentDirect({
      prompt,
      invokerUserId: uid,
      discordContext: getMentionDiscordContext(thread, message),
      replyTarget: getMentionReplyTarget(thread, message),
    });
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    await thread.post(`Could not answer: ${err}`);
  }
}

function isBotMessage(message: Message) {
  const raw = message.raw;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return false;
  }
  const author = (raw as { author?: unknown }).author;
  return Boolean(author && typeof author === "object" && !Array.isArray(author) && (author as { bot?: unknown }).bot === true);
}
