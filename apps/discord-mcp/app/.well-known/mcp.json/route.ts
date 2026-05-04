import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-static";

/**
 * Lightweight MCP discovery document — points clients at the canonical Streamable-HTTP endpoint and
 * advertises the auth scheme. Phase 9 promotes this to a full CIMD/OAuth manifest; for now it's a
 * machine-readable hint plus a human-readable URL.
 */
export function GET(request: Request) {
  const origin = new URL(request.url).origin;
  return NextResponse.json({
    name: "agent-z-discord-mcp",
    version: "0.1.0",
    description:
      "Tier-gated Discord moderation tools, channel/pinned/tier-matrix resources, and mod-cockpit prompts. Used in-process by Agent Z and exposable to external MCP clients.",
    transports: {
      streamableHttp: `${origin}/api/mcp`,
      sse: `${origin}/api/sse`,
    },
    authentication: {
      type: "bearer",
      header: "Authorization: Bearer <MCP_API_KEY>",
      actorHeaders: [
        "X-Actor-Discord-User-Id",
        "X-Actor-Discord-Guild-Id",
        "X-Actor-Discord-Channel-Id",
        "X-Actor-Discord-Role-Ids",
        "X-Actor-Discord-Is-Dm",
      ],
    },
    notes:
      "Bearer auth is the v1 surface. Phase 9 of the rebuild plan upgrades this to MCP OAuth 2.1 with the .well-known/oauth-protected-resource manifest already shipped at the sibling route.",
  });
}
