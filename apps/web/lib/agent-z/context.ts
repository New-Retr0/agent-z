/**
 * Typed assembly of Agent Z system-prompt inputs (tier, invoker, profile, hints).
 */

import type { AgentTier, DiscordInvocationContext } from "@repo/agent/types";
import type { ProfileNote, UserProfileSnapshot } from "@repo/db";

export type AgentZPromptBlocks = {
  tier: AgentTier;
  knowledge: string;
  override: string | null;
  invokerUserId: string;
  invokerDiscordIdentity: string;
  invokerProfile: UserProfileSnapshot | null;
  context7Available: boolean;
};

export function formatInvokerDiscordIdentity(
  ctx: Pick<DiscordInvocationContext, "invokerUsername" | "invokerGlobalName">
): string {
  const username = ctx.invokerUsername?.trim();
  const globalName = ctx.invokerGlobalName?.trim();
  if (username || globalName) {
    const handle = username ? `@${username}` : "@(unknown)";
    const display = globalName ? ` — display: ${globalName}` : "";
    return `${handle}${display}`;
  }
  return "Discord username/display were not included by this host (slash/mention payload). Use the user id below and prefer tools for member lookup.";
}

export function formatProfileBlock(profile: UserProfileSnapshot | null): string {
  if (!profile) {
    return "No Agent Z memory notes/preferences stored yet (separate from Discord identity above).";
  }
  const lastNotes = profile.notes.slice(-15);
  const notesBlock = lastNotes.length
    ? lastNotes.map((n: ProfileNote) => `  - (${n.kind ?? "note"}) ${n.text}`).join("\n")
    : "  (no notes yet)";
  const prefsKeys = Object.keys(profile.preferences);
  const prefsBlock = prefsKeys.length
    ? prefsKeys.map((k) => `  - ${k}: ${JSON.stringify(profile.preferences[k])}`).join("\n")
    : "  (no preferences recorded)";
  const lastSeen = profile.lastSeenAt ? profile.lastSeenAt.toISOString() : "never recorded";
  return `(Operator-maintained hints — not verified transcript; do not invent user confirmations from these lines.)
Display name: ${profile.displayName ?? "unknown"}
Last seen: ${lastSeen}
Notes:
${notesBlock}
Preferences:
${prefsBlock}`;
}

export function buildAgentZPromptBlocks(args: {
  tier: AgentTier;
  knowledge: string;
  override: string | null;
  invokerUserId: string;
  discordCtx: DiscordInvocationContext;
  invokerProfile: UserProfileSnapshot | null;
  context7Available: boolean;
}): AgentZPromptBlocks {
  return {
    tier: args.tier,
    knowledge: args.knowledge,
    override: args.override,
    invokerUserId: args.invokerUserId,
    invokerDiscordIdentity: formatInvokerDiscordIdentity(args.discordCtx),
    invokerProfile: args.invokerProfile,
    context7Available: args.context7Available,
  };
}
