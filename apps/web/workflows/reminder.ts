import { sleep } from "workflow";
import type { ReminderProposal } from "@/lib/agent-z/direct";
import { stepPostReminder } from "./steps/reminder";

export async function runReminderWorkflow(input: ReminderProposal) {
  "use workflow";
  const delayMs = new Date(input.dueAt).getTime() - Date.now();
  if (delayMs > 0) {
    await sleep(`${delayMs}ms`);
  }
  await stepPostReminder(input);
  return { delivered: true };
}
