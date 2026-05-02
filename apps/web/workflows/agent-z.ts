import { DurableAgent } from "@workflow/ai/agent";
import { getWritable } from "workflow";
import { getToolsForTier } from "@repo/agent/tier-tools";
import type { AgentReplyTarget, AgentTier, DiscordInvocationContext } from "@repo/agent/types";
import {
  stepMarkAgentRunFailed,
  stepPersistAgentRunFinish,
  stepPostAgentRunReply,
} from "./steps/agent-run-persist";

export type RunAgentZWorkflowInput = {
  /** Pre-inserted `AgentRun.id` to attach workflow results to. */
  agentRunId: string;
  prompt: string;
  modelId: string;
  system: string;
  tier: AgentTier;
  discordContext?: DiscordInvocationContext;
  invokerUserId?: string;
  replyTarget?: AgentReplyTarget;
};

/**
 * Crash-safe agent run. Invoked with `start(runAgentZWorkflow, [input])` from `workflow/api`.
 * Tier tools receive `{ tier }` via `experimental_context`.
 * DB writes run in `use step` functions.
 */
export async function runAgentZWorkflow(input: RunAgentZWorkflowInput) {
  "use workflow";
  const tools = getToolsForTier(input.tier);
  const agent = new DurableAgent({
    model: input.modelId,
    instructions: input.system,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tools: tools as any,
  });
  try {
    return await agent.stream({
      messages: [{ role: "user", content: input.prompt }],
      writable: getWritable(),
      maxSteps: 20,
      experimental_context: {
        tier: input.tier,
        discordContext: input.discordContext,
        invokerUserId: input.invokerUserId,
      },
      onFinish: async (event) => {
        await stepPersistAgentRunFinish(input.agentRunId, {
          totalUsage: event.totalUsage,
          steps: event.steps.map((s) => ({
            text: s.text,
            toolCalls: s.toolCalls,
            usage: s.usage,
          })),
        });
        await stepPostAgentRunReply(input.replyTarget, input.agentRunId, finalTextFromSteps(event.text, event.steps));
      },
      onError: async ({ error }) => {
        await stepMarkAgentRunFailed(input.agentRunId, error);
      },
    });
  } catch (e) {
    await stepMarkAgentRunFailed(input.agentRunId, e);
    await stepPostAgentRunReply(
      input.replyTarget,
      input.agentRunId,
      `Agent Z failed before completing: ${e instanceof Error ? e.message : String(e)}`
    );
    throw e;
  }
}

function finalTextFromSteps(finalText: string | undefined, steps: Array<{ text?: string }>) {
  const text = finalText?.trim();
  if (text) {
    return text;
  }
  for (let i = steps.length - 1; i >= 0; i--) {
    const stepText = steps[i]?.text?.trim();
    if (stepText) {
      return stepText;
    }
  }
  return "";
}
