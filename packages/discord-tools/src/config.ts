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

export function loadDiscordToolConfig(env: Record<string, string | undefined> = process.env) {
  const token = env.DISCORD_BOT_TOKEN?.trim();
  if (!token) {
    throw new Error("Missing DISCORD_BOT_TOKEN. Set your bot token in the environment.");
  }

  const apiVersion = env.DISCORD_API_VERSION?.trim() || "10";
  if (!/^\d+$/.test(apiVersion)) {
    throw new Error("DISCORD_API_VERSION must be a numeric API version (e.g. 10).");
  }

  return {
    token,
    apiVersion,
    baseUrl: `https://discord.com/api/v${apiVersion}`,
    allowedGuildIds: parseGuildAllowlist(env.DISCORD_ALLOWED_GUILD_IDS),
    reactionVerifiedRoleId: env.REACTION_VERIFIED_ROLE_ID?.trim() || null,
    mcpAllowDeleteVerifiedRole: ["1", "true", "yes"].includes(
      (env.MCP_ALLOW_DELETE_VERIFIED_ROLE ?? "").trim().toLowerCase()
    ),
    protectedOwnerUserId: env.PROTECTED_OWNER_USER_ID?.trim() || null,
    userAgent: "DiscordBot (https://docs.discord.com/developers, Agent-Z/1.0)",
  };
}

export type DiscordToolConfig = ReturnType<typeof loadDiscordToolConfig>;
