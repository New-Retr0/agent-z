const SNOWFLAKE_RE = /^\d{17,20}$/;

function parseGuildAllowlist(raw: string | undefined): Set<string> | null {
  if (!raw?.trim()) return null;
  const ids = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const id of ids) {
    if (!SNOWFLAKE_RE.test(id)) {
      throw new Error(
        `DISCORD_ALLOWED_GUILD_IDS: invalid snowflake "${id}" (expected 17–20 digit id)`
      );
    }
  }
  return new Set(ids);
}

export function loadConfig() {
  const token = process.env.DISCORD_BOT_TOKEN?.trim();
  if (!token) {
    throw new Error(
      "Missing DISCORD_BOT_TOKEN. Set your bot token in the environment (never pass it in tool arguments)."
    );
  }

  const apiVersion = process.env.DISCORD_API_VERSION?.trim() || "10";
  if (!/^\d+$/.test(apiVersion)) {
    throw new Error("DISCORD_API_VERSION must be a numeric API version (e.g. 10).");
  }

  let allowedGuildIds: Set<string> | null;
  try {
    allowedGuildIds = parseGuildAllowlist(process.env.DISCORD_ALLOWED_GUILD_IDS);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(msg);
  }

  const reactionVerifiedRoleId = process.env.REACTION_VERIFIED_ROLE_ID?.trim() || null;
  const mcpAllowDeleteVerifiedRole = ["1", "true", "yes"].includes(
    (process.env.MCP_ALLOW_DELETE_VERIFIED_ROLE ?? "").trim().toLowerCase()
  );

  return {
    token,
    apiVersion,
    baseUrl: `https://discord.com/api/v${apiVersion}`,
    allowedGuildIds,
    reactionVerifiedRoleId,
    mcpAllowDeleteVerifiedRole,
    userAgent: `DiscordBot (https://docs.discord.com/developers, 1.0.0)`,
  };
}

export type AppConfig = ReturnType<typeof loadConfig>;
