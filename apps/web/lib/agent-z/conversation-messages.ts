import type { RecentTurn } from "@repo/db";
import type { ModelMessage } from "ai";

/** Prevent one corrupted long reply from poisoning future turns. */
const MAX_ASSISTANT_CHARS = 2_800;
const MAX_INVOKER_USER_CHARS = 2_800;
const MAX_CROSS_USER_CHARS = 1_500;

function clip(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, Math.max(0, max - 16))}\n[truncated…]`;
}

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
      out.push({ role: "assistant", content: clip(content, MAX_ASSISTANT_CHARS) });
      continue;
    }
    if (t.role === "user") {
      const raw =
        t.userId === invokerUserId ? content : `[Discord user id ${t.userId}] ${content}`;
      const max = t.userId === invokerUserId ? MAX_INVOKER_USER_CHARS : MAX_CROSS_USER_CHARS;
      out.push({ role: "user", content: clip(raw, max) });
      continue;
    }
  }
  return out;
}
