/**
 * Resolves the guild id from the same env variables as the main bot and register script.
 */
export function resolveGuildId(): string {
  const explicit =
    process.env.REACTION_GUILD_ID?.trim() ?? process.env.DISCORD_GUILD_ID?.trim();
  if (explicit) {
    return explicit;
  }
  const fromAllowlist = (process.env.DISCORD_ALLOWED_GUILD_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (fromAllowlist.length === 1) {
    return fromAllowlist[0]!;
  }
  throw new Error(
    "Set REACTION_GUILD_ID (or DISCORD_GUILD_ID), or put exactly one id in DISCORD_ALLOWED_GUILD_IDS."
  );
}
