import type { RecentTurn } from "@repo/db";
import type { ModelMessage } from "ai";

/**
 * Maps persisted channel turns into SDK chat messages (AI SDK expects roles, not a fake log).
 * Omits tool/system rows — those aren’t replayed as native tool-call rounds today.
 */
export function turnsToChatMessages(turns: RecentTurn[], invokerUserId: string): ModelMessage[] {
  const out: ModelMessage[] = [];
  for (const t of turns) {
    const content = t.content.trim();
    if (!content) continue;

    if (t.role === "assistant") {
      out.push({ role: "assistant", content });
      continue;
    }
    if (t.role === "user") {
      const body =
        t.userId === invokerUserId ? content : `[Discord user id ${t.userId}] ${content}`;
      out.push({ role: "user", content: body });
      continue;
    }
  }
  return out;
}
