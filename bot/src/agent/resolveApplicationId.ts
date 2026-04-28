/**
 * App id for REST routes — usually equals the bot's user id; prefer env, else resolve via API.
 */
export async function resolveApplicationId(
  token: string,
  fromEnv: string | undefined
): Promise<string> {
  const t = fromEnv?.trim();
  if (t) {
    return t;
  }
  const res = await fetch("https://discord.com/api/v10/oauth2/applications/@me", {
    headers: { Authorization: `Bot ${token}` },
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(
      `Could not resolve application id (set DISCORD_APPLICATION_ID or DISCORD_CLIENT_ID in .env). API: ${res.status} ${err}`
    );
  }
  const j = (await res.json()) as { id: string };
  if (!j.id) {
    throw new Error("applications/@me returned no id");
  }
  return j.id;
}
