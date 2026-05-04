export function buildDiscordRestCheatsheet(guildId: string | undefined) {
  const guild = guildId || "{guild.id}";
  return `Discord REST (api v10) common routes:
Read:
- GET /guilds/${guild}/channels
- GET /guilds/${guild}/roles
- GET /guilds/${guild}/members/{user_id}
- GET /guilds/${guild}/members?limit=100
- GET /channels/{channel_id}/messages?limit=50
- GET /guilds/${guild}/audit-logs?limit=25

Write:
- POST /channels/{channel_id}/messages { content, embeds?, message_reference? }
- PATCH /channels/{channel_id}/messages/{message_id}
- DELETE /channels/{channel_id}/messages/{message_id}
- POST /channels/{channel_id}/messages/bulk-delete { messages: [ids] }
- PUT/DELETE /guilds/${guild}/members/{user_id}/roles/{role_id}
- PATCH /guilds/${guild}/members/{user_id} { communication_disabled_until }
- POST/PATCH/DELETE /channels

Paths must start with / and JSON bodies only.`;
}
