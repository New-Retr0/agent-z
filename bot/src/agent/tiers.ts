import type { AgentZConfig } from "./botConfig.js";
import { isAdminMember, isModeratorMember } from "./botConfig.js";

export type AccessTier = "ADMIN" | "MOD" | "PUBLIC" | "DENY";

/** Which help book to show (3-way). */
export type HelpRole = "Admin" | "Moderator" | "Verified";

export function memberRoleIds(
  m: { roles: { cache: Map<string, unknown> } } | { roles: string[] } | null
): string[] {
  if (!m) return [];
  if ("cache" in m.roles && m.roles.cache) {
    return [...m.roles.cache.keys()];
  }
  if (Array.isArray(m.roles)) {
    return m.roles;
  }
  return [];
}

export function helpRoleFor(roleIds: string[], cfg: AgentZConfig): HelpRole {
  if (isAdminMember(roleIds, cfg)) return "Admin";
  if (isModeratorMember(roleIds, cfg)) return "Moderator";
  return "Verified";
}

export function passesInvokeGate(roleIds: string[], cfg: AgentZConfig): boolean {
  if (!cfg.invokeRoleId) return true;
  for (const id of cfg.adminRoleIds) {
    if (roleIds.includes(id)) return true;
  }
  for (const id of cfg.moderatorRoleIds) {
    if (roleIds.includes(id)) return true;
  }
  if (roleIds.includes(cfg.invokeRoleId)) return true;
  return false;
}

/**
 * @param isDm — if true, never respond (plan: silent; treat as no tier for runner).
 */
export function resolveAccessTier(
  args: { channelId: string; memberRoleIds: string[]; isDm: boolean },
  cfg: AgentZConfig
): AccessTier {
  if (args.isDm) return "DENY";
  if (!cfg.publicTierEnabled) {
    const priv = cfg.privilegedChannelIds.has(args.channelId);
    if (!priv) return "DENY";
  }
  const inPriv = cfg.privilegedChannelIds.has(args.channelId);
  if (inPriv) {
    if (isAdminMember(args.memberRoleIds, cfg)) return "ADMIN";
    const hasModRole = [...cfg.moderatorRoleIds].some((id) =>
      args.memberRoleIds.includes(id)
    );
    if (hasModRole) return "MOD";
    return "PUBLIC";
  }
  return "PUBLIC";
}

export function systemPromptAddendumForTier(tier: AccessTier): string {
  if (tier === "ADMIN") {
    return `## CHANNEL TIER (this conversation)
You're in a privileged context with full server access (within tools available). For destructive or irreversible operations, a confirmation step is required.`;
  }
  if (tier === "MOD") {
    return `## CHANNEL TIER (this conversation)
You're at Moderator read-only access: you may only use GET against Discord. If asked to write, ban, post, or modify server data, do not call tools — reply in one short dry line, e.g. "Read-only at this access level. Ask an admin." No apologies, no lecturing.`;
  }
  return `## CHANNEL TIER (this conversation)
You're in public or unprivileged context: **knowledge tools only** — no Discord REST, no looking up private member lists from APIs, no posting or changing the server. If asked to moderate or take server actions, one short dry refusal line, then stop. No env, no secrets, no "as an AI" preamble.`;
}

export class TierError extends Error {
  readonly name = "TierError";
  constructor(msg: string) {
    super(msg);
  }
}

export function enforceTierForCall(
  tier: AccessTier,
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"
): void {
  if (tier === "PUBLIC") {
    throw new TierError("knowledge-only at this access level");
  }
  if (tier === "MOD" && method !== "GET") {
    throw new TierError("read-only at this access level");
  }
  if (tier === "DENY") {
    throw new TierError("this channel is not enabled for this bot");
  }
}
