import type { Chat, Message, Thread } from "chat";
import { getMentionDiscordContext, getMentionReplyTarget } from "../discord-context";
import { invokeAgentWorkflow } from "../invoke-workflow";

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
      return;
    }
    await invokeFromMessage(thread, message, prompt);
  });
}

async function invokeFromMessage(thread: Thread, message: Message, prompt: string) {
  const uid = message.author.userId;
  try {
    await invokeAgentWorkflow({
      prompt,
      invokerUserId: uid,
      discordContext: getMentionDiscordContext(thread, message),
      replyTarget: getMentionReplyTarget(thread, message),
      maxTier: "verified",
    });
    await thread.post("I'm on it. I'll reply here when I finish.");
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    await thread.post(`Could not start agent: ${err}`);
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
