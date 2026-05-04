import { unstable_cache } from "next/cache";
import { prisma } from "@repo/db";
import type { Actor } from "./auth";

export type Tier = "admin" | "mod" | "verified" | "public";

const TIER_RANK: Record<Tier, number> = {
  public: 0,
  verified: 1,
  mod: 2,
  admin: 3,
};

const ROLE_MAPPING_KINDS: Tier[] = ["admin", "mod", "verified"];

/**
 * Cached snapshot of `RoleMapping`. The Discord MCP server is read-mostly; we refresh every 60 s.
 * Operators that change role mappings via the admin UI tolerate a one-minute delay before the new
 * mapping takes effect across MCP traffic; in exchange we avoid a Prisma round-trip on every tool call.
 */
const getRoleMatrixCached = unstable_cache(
  async () => {
    const rows = await prisma.roleMapping.findMany({
      where: { kind: { in: ROLE_MAPPING_KINDS } },
      select: { kind: true, discordRoleId: true },
    });
    const matrix: Record<Tier, Set<string>> = {
      admin: new Set(),
      mod: new Set(),
      verified: new Set(),
      public: new Set(),
    };
    for (const row of rows) {
      if (ROLE_MAPPING_KINDS.includes(row.kind as Tier)) {
        matrix[row.kind as Tier].add(row.discordRoleId);
      }
    }
    return matrix;
  },
  ["mcp-role-matrix-v1"],
  { revalidate: 60, tags: ["role-mapping"] }
);

/** Cached role matrix for tier guards (staged moderation, etc.). */
export async function getCachedRoleTierMatrix(): Promise<Record<Tier, Set<string>>> {
  return getRoleMatrixCached();
}

/**
 * Resolve the tier of an MCP caller from their Discord role IDs (`RoleMapping` in Postgres).
 */
export async function resolveTier(actor: Actor): Promise<Tier> {
  let tier: Tier = "public";

  const matrix = await getRoleMatrixCached();
  const roles = new Set(actor.roleIds);
  tier = "public";
  for (const t of ["admin", "mod", "verified"] as const) {
    if ([...matrix[t]].some((roleId) => roles.has(roleId))) {
      tier = t;
      break;
    }
  }

  if (actor.tierCap && TIER_RANK[tier] > TIER_RANK[actor.tierCap]) {
    return actor.tierCap;
  }
  return tier;
}

export function meetsTier(actual: Tier, required: Tier): boolean {
  return TIER_RANK[actual] >= TIER_RANK[required];
}

export function tierLabel(tier: Tier): string {
  return tier[0].toUpperCase() + tier.slice(1);
}
