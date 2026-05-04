/** Button / modal custom IDs for staged destructive confirmation UI (Grow-a-Tree style). */

import { editOriginalInteraction } from "@/lib/discord-replies";

const EPHEMERAL_FLAG = 64;

export const STAGED_CONFIRM_PREFIX = "azconfirm:";
export const STAGED_CANCEL_PREFIX = "azcancel:";
export const STAGED_DETAILS_PREFIX = "azdetails:";
export const STAGED_EDIT_PREFIX = "azedit:";
export const STAGED_PREVIEW_PREFIX = "azpreview:";
export const STAGED_EDIT_SUBMIT_PREFIX = "azeditsubmit:";
export const STAGED_EDIT_TEXT_INPUT_ID = "az_edit_reason";

export function stagedCapabilityShowsPreview(capability: string): boolean {
  const c = capability.toLowerCase();
  return (
    c.includes("bulk_delete") ||
    c.includes("delete_message") ||
    c.includes("edit_message")
  );
}

export function buildStagedActionComponents(args: {
  token: string;
  capability: string;
}): Array<Record<string, unknown>> {
  const rows: Array<Record<string, unknown>> = [];
  rows.push({
    type: 1,
    components: [
      {
        type: 2,
        style: 3,
        label: "Confirm",
        custom_id: `${STAGED_CONFIRM_PREFIX}${args.token}`,
      },
      {
        type: 2,
        style: 4,
        label: "Cancel",
        custom_id: `${STAGED_CANCEL_PREFIX}${args.token}`,
      },
      {
        type: 2,
        style: 2,
        label: "Details",
        custom_id: `${STAGED_DETAILS_PREFIX}${args.token}`,
      },
    ],
  });

  const row2: Array<Record<string, unknown>> = [
    {
      type: 2,
      style: 2,
      label: "Edit reason",
      custom_id: `${STAGED_EDIT_PREFIX}${args.token}`,
    },
  ];
  if (stagedCapabilityShowsPreview(args.capability)) {
    row2.push({
      type: 2,
      style: 2,
      label: "Preview",
      custom_id: `${STAGED_PREVIEW_PREFIX}${args.token}`,
    });
  }
  rows.push({ type: 1, components: row2 });
  return rows;
}

export function buildStagingDiscordEmbed(args: {
  token: string;
  capability: string;
  summary: string;
  expiresAt: Date;
  /** First ~800 chars from the assistant transcript (Discord field limit handled). */
  assistantSnippet?: string;
}): Record<string, unknown> {
  const msLeft = Math.max(0, args.expiresAt.getTime() - Date.now());
  const minutes = Math.max(1, Math.round(msLeft / 60_000));
  const fields: Array<{ name: string; value: string; inline?: boolean }> = [
    { name: "Summary / reason", value: (args.summary.trim() || "—").slice(0, 1024) },
  ];
  if (args.assistantSnippet?.trim()) {
    fields.push({
      name: "Assistant note",
      value: args.assistantSnippet.trim().slice(0, 1000),
    });
  }
  fields.push({ name: "Token", value: `\`${args.token}\``, inline: true });
  fields.push({ name: "Expires (approx.)", value: `~${minutes}m`, inline: true });

  return {
    title: `Staged: ${args.capability}`,
    description: `Use **Confirm / Cancel** below (${args.token}).`,
    color: 0xf97316,
    fields,
  };
}

/** Discord APPLICATION_MODAL (response type 9) payload for PATCH summary before confirm. */
export function buildEditStagedReasonModal(token: string): Record<string, unknown> {
  return {
    title: "Edit staged summary",
    custom_id: `${STAGED_EDIT_SUBMIT_PREFIX}${token}`,
    components: [
      {
        type: 1,
        components: [
          {
            type: 4,
            custom_id: STAGED_EDIT_TEXT_INPUT_ID,
            label: "Reason / moderation note",
            style: 2,
            min_length: 1,
            max_length: 500,
            placeholder: "Short note reviewers see before confirming",
            required: true,
          },
        ],
      },
    ],
  };
}

export async function refreshStagedActionInteractionMessage(
  pending: {
    token: string;
    capability: string;
    summary: string;
    expiresAt: Date;
    interactionApplicationId?: string | null;
    interactionToken?: string | null;
  },
  extras?: { assistantSnippet?: string }
): Promise<boolean> {
  const appId = pending.interactionApplicationId?.trim();
  const iTok = pending.interactionToken?.trim();
  if (!appId || !iTok) return false;

  const contentTail = extras?.assistantSnippet?.trim() ? extras.assistantSnippet.trim().slice(0, 400) : "\u200b";

  await editOriginalInteraction(appId, iTok, contentTail, {
    flags: EPHEMERAL_FLAG,
    embeds: [
      buildStagingDiscordEmbed({
        token: pending.token,
        capability: pending.capability,
        summary: pending.summary,
        expiresAt: pending.expiresAt,
        assistantSnippet: extras?.assistantSnippet?.trim(),
      }),
    ],
    components: buildStagedActionComponents({
      token: pending.token,
      capability: pending.capability,
    }),
    allowedMentions: { parse: [] },
  });
  return true;
}
