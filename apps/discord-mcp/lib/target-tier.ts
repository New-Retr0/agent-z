/**
 * Resolve a guild member's Agent Z tier for moderation guards (Discord REST + Postgres role matrix).
 */
import { getRuntimeConfig } from "@repo/config/runtime-config";
import { discordRequest, loadDiscordToolConfig } from "@repo/discord-tools";
import type { Tier } from "./tier";

const memberTierCache = new Map<string, { tier: Tier; expiresAt: number }>();
const CACHE_TTL_MS = 60_000;

async function discordConfigForTierFetch(): Promise<ReturnType<typeof loadDiscordToolConfig>> {
  const rc = await getRuntimeConfig();
  return loadDiscordToolConfig(process.env, {
    reactionVerifiedRoleIdFromDb: rc.verifiedRoleId,
    allowDeleteVerifiedRoleFromDb: rc.allowDeleteVerifiedRole,
  });
}

/** Tier for a Discord member inferred from guild roles × `RoleMapping` matrix. API failure → `"public"`. */
export async function resolveTargetMemberTier(args: {
  guildId: string;
  userId: string;
  matrix: Record<Tier, Set<string>>;
}): Promise<Tier> {
  const key = `${args.guildId}:${args.userId}`;
  const hit = memberTierCache.get(key);
  if (hit && hit.expiresAt > Date.now()) {
    return hit.tier;
  }

  let tier: Tier = "public";

  try {
    const config = await discordConfigForTierFetch();
    const res = await discordRequest(config, {
      method: "GET",
      path: `/guilds/${args.guildId}/members/${args.userId}`,
    });
    if (res.status < 200 || res.status >= 300) {
      memberTierCache.set(key, { tier: "public", expiresAt: Date.now() + CACHE_TTL_MS });
      return "public";
    }
    const roles = new Set(Array.isArray((res.body as { roles?: unknown })?.roles)
      ? ((res.body as { roles: string[] }).roles ?? [])
      : []);
    tier = "public";
    for (const t of ["admin", "mod", "verified"] as const) {
      if ([...args.matrix[t]].some((rid) => roles.has(rid))) {
        tier = t;
        break;
      }
    }
  } catch {
    tier = "public";
  }

  memberTierCache.set(key, { tier, expiresAt: Date.now() + CACHE_TTL_MS });
  return tier;
}

/** Targets mapped as **admin** tier cannot be moderated via Agent Z (any caller). */
export function tierBlocksAgentModeration(targetTier: Tier): boolean {
  return targetTier === "admin";
}
