import type { HttpMethod } from "./discordRest.js";

/**
 * Heuristic: requires button confirmation from the invoker before executing the Discord call.
 */
export function isDestructiveDiscordCall(
  method: HttpMethod,
  path: string,
  body: unknown
): boolean {
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
      const b = body && typeof body === "object" ? (body as Record<string, unknown>) : null;
      if (b && ("communication_disabled_until" in b || "roles" in b)) {
        return true;
      }
    }
  }
  return false;
}
