const SNOWFLAKE_RE = /^\d{17,20}$/;

function parseGuildAllowlist(raw: string | undefined): Set<string> | null {
  if (!raw?.trim()) return null;
  const ids = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const id of ids) {
    if (!SNOWFLAKE_RE.test(id)) {
      throw new Error(`DISCORD_ALLOWED_GUILD_IDS: invalid snowflake "${id}" (expected 17-20 digit id)`);
    }
  }
  return new Set(ids);
}

/** Optional overrides — DB-backed runtime wins over env (`ALLOW_DELETE` from Postgres when explicitly false). */
export type LoadDiscordToolConfigOptions = {
  /** From `runtime_config` / BotConfig (`verified_role_id`). When absent, falls back to `REACTION_VERIFIED_ROLE_ID`. */
  reactionVerifiedRoleIdFromDb?: string | null;
  /** From BotConfig (`allow_delete_verified_role`). When provided, replaces env MCP_ALLOW_DELETE_VERIFIED_ROLE lookup. */
  allowDeleteVerifiedRoleFromDb?: boolean;
};

export function loadDiscordToolConfig(
  env: Record<string, string | undefined> = process.env,
  opts?: LoadDiscordToolConfigOptions
) {
  const token = env.DISCORD_BOT_TOKEN?.trim();
  if (!token) {
    throw new Error("Missing DISCORD_BOT_TOKEN. Set your bot token in the environment.");
  }

  const apiVersion = env.DISCORD_API_VERSION?.trim() || "10";
  if (!/^\d+$/.test(apiVersion)) {
    throw new Error("DISCORD_API_VERSION must be a numeric API version (e.g. 10).");
  }

  const fromDb = opts?.reactionVerifiedRoleIdFromDb?.trim();
  const reactionVerifiedRoleId =
    fromDb !== undefined && fromDb.length > 0
      ? fromDb
      : env.REACTION_VERIFIED_ROLE_ID?.trim() || null;

  let mcpAllowDeleteVerifiedRole = ["1", "true", "yes"].includes(
    (env.MCP_ALLOW_DELETE_VERIFIED_ROLE ?? "").trim().toLowerCase()
  );
  if (typeof opts?.allowDeleteVerifiedRoleFromDb === "boolean") {
    mcpAllowDeleteVerifiedRole = opts.allowDeleteVerifiedRoleFromDb;
  }

  return {
    token,
    apiVersion,
    baseUrl: `https://discord.com/api/v${apiVersion}`,
    allowedGuildIds: parseGuildAllowlist(env.DISCORD_ALLOWED_GUILD_IDS),
    reactionVerifiedRoleId,
    mcpAllowDeleteVerifiedRole,
    protectedOwnerUserId: env.PROTECTED_OWNER_USER_ID?.trim() || null,
    userAgent: "DiscordBot (https://discord.com/developers, Agent-Z/1.0)",
  };
}

export type DiscordToolConfig = ReturnType<typeof loadDiscordToolConfig>;
