import { start } from "workflow/api";
import { prisma } from "@repo/db";
import { runReminderWorkflow } from "@/workflows/reminder";
import type { ReminderProposal } from "./direct";

type WorkflowActionResult = {
  text: string;
  components?: Array<Record<string, unknown>>;
  ephemeral?: boolean;
};

export function parseWorkflowActionCustomId(customId: string | undefined) {
  const match = customId?.match(/^agentz:(start|cancel):([0-9a-f-]{36})$/i);
  if (!match) {
    return null;
  }
  return { action: match[1] as "start" | "cancel", token: match[2] };
}

export async function handleWorkflowAction(input: {
  action: "start" | "cancel";
  token: string;
  userId: string;
}): Promise<WorkflowActionResult> {
  const confirmation = await prisma.confirmation.findUnique({
    where: { hookToken: input.token },
  });
  if (!confirmation) {
    return { text: "That workflow proposal no longer exists.", ephemeral: true };
  }
  if (confirmation.requestedBy !== input.userId) {
    return { text: "Only the person who requested this workflow can start or cancel it.", ephemeral: true };
  }
  if (confirmation.status !== "pending") {
    return { text: `That workflow proposal is already ${confirmation.status}.`, ephemeral: true };
  }

  if (input.action === "cancel") {
    await prisma.confirmation.update({
      where: { hookToken: input.token },
      data: { status: "cancelled", resolvedAt: new Date() },
    });
    return { text: "Cancelled. I will not start that workflow.", components: [] };
  }

  const proposal = JSON.parse(confirmation.summary) as ReminderProposal;
  if (proposal.kind !== "reminder") {
    return { text: "I do not know how to start that workflow type yet.", ephemeral: true };
  }

  const run = await start(runReminderWorkflow, [proposal]);
  await prisma.confirmation.update({
    where: { hookToken: input.token },
    data: {
      status: "started",
      workflowRunId: run.runId,
      resolvedAt: new Date(),
    },
  });

  return {
    text: `Started reminder workflow. I will post the reminder <t:${Math.floor(new Date(proposal.dueAt).getTime() / 1000)}:R>.`,
    components: [],
  };
}
