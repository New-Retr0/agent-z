/**
 * Bearer-token + actor-context resolution for the Discord MCP server.
 *
 * The MCP server is consumed in two modes:
 *
 *   1. **In-process** (the agent inside `apps/web` opens an `experimental_createMCPClient`).
 *      Headers are set programmatically; we trust them because the caller is the same Vercel project.
 *
 *   2. **External** (Cursor / Claude Desktop / ChatGPT custom connectors / a forked bot).
 *      The bearer token is the only thing standing between the caller and our Discord bot's powers, so
 *      `MCP_API_KEY` must be a high-entropy secret. The actor headers are still required and are
 *      verified server-side: a wrong `X-Actor-Discord-Role-Ids` value just downgrades the caller's tier
 *      via the role mapping table — it cannot escalate them.
 *
 * The bearer is fixed (single key) for v1. Phase 9 of the rebuild plan upgrades this to MCP OAuth 2.1
 * with the existing `.well-known/oauth-protected-resource` route as a stub.
 */

import { z } from "zod";

export const actorSchema = z.object({
  userId: z.string().regex(/^\d{17,20}$/).optional(),
  guildId: z.string().regex(/^\d{17,20}$/).optional(),
  channelId: z.string().regex(/^\d{17,20}$/).optional(),
  roleIds: z.array(z.string().regex(/^\d{17,20}$/)).default([]),
  isDirectMessage: z.boolean().default(false),
  /** Ephemeral Discord interaction (slash) used when staging actions from /agent-z-admin. */
  interactionToken: z.string().max(2000).optional(),
  interactionApplicationId: z.string().regex(/^\d{17,20}$/).optional(),
  tierCap: z.enum(["admin", "mod", "verified", "public"]).optional(),
});

export const ACTOR_HEADERS = {
  userId: "x-actor-discord-user-id",
  guildId: "x-actor-discord-guild-id",
  channelId: "x-actor-discord-channel-id",
  roleIds: "x-actor-discord-role-ids",
  isDm: "x-actor-discord-is-dm",
  tierCap: "x-agent-z-tier-cap",
  interactionToken: "x-agent-z-interaction-token",
  interactionApplicationId: "x-agent-z-interaction-application-id",
} as const;

export type Actor = z.infer<typeof actorSchema>;

export function readActorFromHeaders(headers: Headers): Actor {
  const rawRoleIds = headers.get(ACTOR_HEADERS.roleIds)?.trim() ?? "";
  const capRaw = headers.get(ACTOR_HEADERS.tierCap)?.trim().toLowerCase();
  const tierCap =
    capRaw === "admin" || capRaw === "mod" || capRaw === "verified" || capRaw === "public"
      ? capRaw
      : undefined;
  return actorSchema.parse({
    userId: headers.get(ACTOR_HEADERS.userId)?.trim() || undefined,
    guildId: headers.get(ACTOR_HEADERS.guildId)?.trim() || undefined,
    channelId: headers.get(ACTOR_HEADERS.channelId)?.trim() || undefined,
    roleIds: rawRoleIds
      ? rawRoleIds
          .split(",")
          .map((id) => id.trim())
          .filter((id) => /^\d{17,20}$/.test(id))
      : [],
    isDirectMessage: headers.get(ACTOR_HEADERS.isDm)?.trim() === "1",
    tierCap,
    interactionToken: headers.get(ACTOR_HEADERS.interactionToken)?.trim() || undefined,
    interactionApplicationId: headers.get(ACTOR_HEADERS.interactionApplicationId)?.trim() || undefined,
  });
}

export function requireMcpApiKey(): string {
  const key = process.env.MCP_API_KEY?.trim();
  if (!key) {
    throw new Error(
      "MCP_API_KEY is not configured. Generate a high-entropy secret and set it on the Discord MCP Vercel project."
    );
  }
  return key;
}

/**
 * Token verifier passed to `withMcpAuth`. Returns the canonical `AuthInfo` shape mcp-handler expects,
 * carrying the resolved actor in `extra` so tool/resource/prompt handlers can pick it up via the MCP
 * request context.
 *
 * `mcp-handler`'s `withMcpAuth` calls this with `(req, bearerToken)`. We re-read the actor from the
 * request headers because the bearer alone is not enough context for tier resolution.
 */
export async function verifyBearer(req: Request, bearerToken: string | undefined) {
  const expected = requireMcpApiKey();
  if (!bearerToken || bearerToken !== expected) {
    return undefined;
  }
  const actor = readActorFromHeaders(req.headers);
  return {
    token: "mcp-api-key",
    clientId: "agent-z",
    scopes: ["mcp:tools", "mcp:resources", "mcp:prompts"],
    extra: { actor },
  };
}

export const ACTOR_HEADER_NAMES = ACTOR_HEADERS satisfies Record<string, string>;