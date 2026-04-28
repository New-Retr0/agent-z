import type { AgentZConfig } from "./botConfig.js";
import type { HttpMethod } from "./discordRest.js";

export class ProtectedTargetError extends Error {
  readonly name = "ProtectedTargetError";
  constructor() {
    super("Can't do that one.");
  }
}

/**
 * Pre-flight check: block clearly adversarial routes targeting the protected user id.
 * (Bulk delete by message id would require a prefetch to verify author — handled via prompt + mod policy.)
 */
export function assertNotTargetingProtectedUser(
  cfg: AgentZConfig,
  method: HttpMethod,
  path: string,
  body: unknown
): void {
  const owner = cfg.protectedOwnerUserId;

  if (path.includes(`/members/${owner}`) && path.includes("/roles/") && method === "DELETE") {
    throw new ProtectedTargetError();
  }

  if (method === "DELETE" && new RegExp(`/guilds/\\d{17,20}/members/${owner}/?$`).test(path)) {
    throw new ProtectedTargetError();
  }

  if (["PUT", "DELETE"].includes(method) && /\/bans\//.test(path) && path.endsWith(`/${owner}`)) {
    throw new ProtectedTargetError();
  }

  if (method === "PATCH" && path.includes(`/members/${owner}`) && !path.includes("/roles/")) {
    const bodyObj = body && typeof body === "object" ? (body as Record<string, unknown>) : null;
    if (bodyObj && ("communication_disabled_until" in bodyObj || "roles" in bodyObj)) {
      throw new ProtectedTargetError();
    }
  }
}
