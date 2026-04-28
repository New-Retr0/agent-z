/** Shared with MCP tool description. Use ${GUILD_ID} replacement at runtime for bot. */
export function buildDiscordRestCheatsheet(guildId: string): string {
  return `Discord REST (api v10) — common routes (GUILD_ID=${guildId}):

Read:
- GET /guilds/${guildId}/channels
- GET /guilds/${guildId}/roles
- GET /guilds/${guildId}/members/{user_id}
- GET /guilds/${guildId}/members?limit=100
- GET /channels/{channel_id}/messages?limit=50
- GET /guilds/${guildId}/audit-logs?limit=25

Write (many need confirmation in Agent Z):
- POST /channels/{channel_id}/messages { content, embeds?, message_reference? }
- PATCH /channels/{channel_id}/messages/{message_id}
- DELETE /channels/{channel_id}/messages/{message_id}  (DESTRUCTIVE)
- POST /channels/{channel_id}/messages/bulk-delete { messages: [ids] }  (DESTRUCTIVE)
- POST /guilds/${guildId}/bans/{user_id}  (DESTRUCTIVE)
- DELETE /guilds/${guildId}/bans/{user_id}
- DELETE /guilds/${guildId}/members/{user_id}  (kick) (DESTRUCTIVE)
- PATCH /guilds/${guildId}/members/{user_id} { communication_disabled_until }  (timeout) (DESTRUCTIVE)
- PUT/DELETE /guilds/${guildId}/members/{user_id}/roles/{role_id}
- POST /guilds/${guildId}/channels { name, type, parent_id, ... }
- PATCH /channels/{channel_id} { name, topic, ... }
- DELETE /channels/{channel_id}  (DESTRUCTIVE)
Paths must start with /; use JSON body only (no multipart uploads here).`;
}
