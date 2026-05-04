import { createHook, sleep } from "workflow";
import {
  loadPendingActionByToken,
  resolvePendingAction,
} from "@repo/db";
import { executePendingDiscordAction } from "@/lib/agent-z/execute-pending";
import { editOriginalInteraction } from "@/lib/discord-replies";

const EPHEMERAL_FLAG = 64;

/** Hook token shared with Discord component handlers (`resumeHook`). */
export function stagedActionHookToken(paToken: string): string {
  return `az-staged:${paToken}`;
}

export type StagedDecision =
  | { kind: "confirm"; actorId: string }
  | { kind: "cancel"; actorId: string }
  | { kind: "expired" };

async function applyStagedDecision(paToken: string, decision: StagedDecision) {
  "use step";

  const pending = await loadPendingActionByToken(paToken);
  if (!pending || pending.status !== "pending") {
    return;
  }

  const applicationId =
    pending.interactionApplicationId?.trim() || process.env.DISCORD_APPLICATION_ID?.trim();
  const interactionToken = pending.interactionToken?.trim();

  async function patch(content: string, components: Array<Record<string, unknown>> = []) {
    if (!applicationId || !interactionToken) return;
    await editOriginalInteraction(applicationId, interactionToken, content, {
      flags: EPHEMERAL_FLAG,
      components,
      allowedMentions: { parse: [] },
    });
  }

  if (decision.kind === "expired") {
    await resolvePendingAction({
      token: paToken,
      status: "expired",
      resultText: "Confirmation window expired.",
    });
    await patch("This confirmation expired.", []);
    return;
  }

  if (decision.kind === "cancel") {
    await resolvePendingAction({
      token: paToken,
      status: "cancelled",
      resultText: "User cancelled.",
    });
    await patch("Cancelled. Nothing was changed.", []);
    return;
  }

  try {
    const out = await executePendingDiscordAction({
      id: pending.id,
      capability: pending.capability,
      inputJson: pending.inputJson,
      invokerUserId: pending.invokerUserId,
      guildId: pending.guildId,
    });
    const clip = out.length > 1800 ? `${out.slice(0, 1797)}...` : out;
    await resolvePendingAction({
      token: paToken,
      status: "executed",
      resultText: out.slice(0, 3500),
    });
    await patch(`**Done**\n${clip}`, []);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await resolvePendingAction({ token: paToken, status: "failed", resultText: msg });
    await patch(`**Failed**\n${msg.slice(0, 1800)}`, []);
  }
}

/**
 * Durable staged destructive action: wait for Confirm/Cancel (via `resumeHook`) or timeout (~5m).
 * Discord PATCH runs inside `applyStagedDecision` so behavior stays deterministic.
 */
export async function stagedDestructiveActionWorkflow(paToken: string) {
  "use workflow";

  const hookToken = stagedActionHookToken(paToken);
  const hook = createHook<StagedDecision>({ token: hookToken });

  const decision = await Promise.race<StagedDecision>([
    hook as unknown as Promise<StagedDecision>,
    sleep("5m").then(() => ({ kind: "expired" as const })),
  ]);

  hook.dispose();

  await applyStagedDecision(paToken, decision);
}
