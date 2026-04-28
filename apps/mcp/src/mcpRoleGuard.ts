/**
 * Optional guard: the MCP uses the same bot token as Agent Z. If a tool
 * sends DELETE /guilds/.../members/.../roles/{VERIFIED}, Audit Log shows
 * this bot removing the role. Default: block; set MCP_ALLOW_DELETE_VERIFIED_ROLE=1
 * to allow.
 */
const MEMBER_ROLE_PATH = /^\/guilds\/(\d{17,20})\/members\/(\d{17,20})\/roles\/(\d{17,20})$/;

export function assertMcpNotDeletingVerifiedRole(
  method: string,
  apiPath: string,
  protectedRoleId: string | null,
  allowDelete: boolean
): void {
  if (allowDelete || !protectedRoleId) return;
  if (method !== "DELETE") return;
  const m = apiPath.match(MEMBER_ROLE_PATH);
  if (!m) return;
  if (m[3] === protectedRoleId) {
    throw new Error(
      "Blocked: DELETE for REACTION_VERIFIED_ROLE_ID. Agent Z does not remove Verified on un-react; the MCP is blocked from removing that role with the same token. Set MCP_ALLOW_DELETE_VERIFIED_ROLE=1 in .env to allow (e.g. mod tools only)."
    );
  }
}
