import type { HttpMethod } from "./discordRest.js";

const MEMBER_ROLE_PATH = /^\/guilds\/(\d{17,20})\/members\/(\d{17,20})\/roles\/(\d{17,20})$/;

export class ProtectedTargetError extends Error {
  readonly name = "ProtectedTargetError";

  constructor() {
    super("Can't do that one.");
  }
}

export function assertNotDeletingVerifiedRole(
  method: string,
  apiPath: string,
  protectedRoleId: string | null,
  allowDelete: boolean
): void {
  if (allowDelete || !protectedRoleId) return;
  if (method !== "DELETE") return;
  const match = apiPath.match(MEMBER_ROLE_PATH);
  if (!match) return;
  if (match[3] === protectedRoleId) {
    throw new Error(
      "Blocked: DELETE for REACTION_VERIFIED_ROLE_ID. Agent Z does not remove Verified on un-react; this tool is blocked from removing that role with the same token."
    );
  }
}

export function assertNotTargetingProtectedUser(
  protectedOwnerUserId: string | null,
  method: HttpMethod,
  path: string,
  body: unknown
): void {
  const owner = protectedOwnerUserId;
  if (!owner) return;

  if (path.includes(`/members/${owner}`) && path.includes("/roles/") && (method === "PUT" || method === "DELETE")) {
    throw new ProtectedTargetError();
  }
  if (method === "DELETE" && new RegExp(`/guilds/\\d{17,20}/members/${owner}/?$`).test(path)) {
    throw new ProtectedTargetError();
  }
  if ((method === "PUT" || method === "DELETE") && /\/bans\//.test(path) && path.endsWith(`/${owner}`)) {
    throw new ProtectedTargetError();
  }
  if (method === "PATCH" && path.includes(`/members/${owner}`) && !path.includes("/roles/")) {
    const bodyObj = body && typeof body === "object" ? (body as Record<string, unknown>) : null;
    if (bodyObj && ("communication_disabled_until" in bodyObj || "roles" in bodyObj)) {
      throw new ProtectedTargetError();
    }
  }
}

export function isDestructiveDiscordCall(method: HttpMethod, path: string, body: unknown): boolean {
  if (method === "GET") {
    return false;
  }
  if (method === "DELETE" && /\/reactions\//.test(path)) {
    return false;
  }
  if (method === "DELETE") {
    return true;
  }
  if (method === "PUT" && /\/bans\//.test(path)) {
    return true;
  }
  if (method === "POST") {
    if (/\/bans$/.test(path) || /\/bans\//.test(path)) {
      return true;
    }
    if (path.includes("bulk-delete")) {
      return true;
    }
  }
  if (method === "PATCH") {
    if (path.includes("/members/") && !/members\/\d{17,20}\/roles\//.test(path)) {
      const bodyObj = body && typeof body === "object" ? (body as Record<string, unknown>) : null;
      if (bodyObj && ("communication_disabled_until" in bodyObj || "roles" in bodyObj)) {
        return true;
      }
    }
  }
  return false;
}
