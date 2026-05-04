export function extractGuildIdsFromPath(apiPath: string): string[] {
  const ids: string[] = [];
  const re = /\/guilds\/(\d{17,20})/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(apiPath)) !== null) {
    ids.push(match[1]);
  }
  return ids;
}

export function assertGuildAllowed(apiPath: string, allowed: Set<string> | null): void {
  if (!allowed?.size) return;
  const found = extractGuildIdsFromPath(apiPath);
  for (const id of found) {
    if (!allowed.has(id)) {
      throw new Error(`Guild ${id} is not in DISCORD_ALLOWED_GUILD_IDS. Allowed: ${[...allowed].join(", ")}`);
    }
  }
}
