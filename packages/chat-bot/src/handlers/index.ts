import type { Chat } from "chat";
import { onSlash } from "./slash";
import { onMention } from "./mention";
import { onReaction } from "./reaction";
import { onAction } from "./action";
import { onDirectMessage } from "./dm";

export function registerHandlers(bot: Chat) {
  onSlash(bot);
  onMention(bot);
  onReaction(bot);
  onAction(bot);
  onDirectMessage(bot);
}
