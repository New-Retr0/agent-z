import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-static";

/**
 * RFC 9728 Protected Resource Metadata — declares the resource name and (eventually) which
 * authorization servers can issue tokens for it. v1 ships a stub; Phase 9 wires up dynamic client
 * registration + Discord-OAuth-backed authorization. Clients that don't need OAuth can ignore this.
 */
export function GET(request: Request) {
  const origin = new URL(request.url).origin;
  return NextResponse.json({
    resource: `${origin}/api/mcp`,
    resource_name: "Agent Z Discord MCP",
    authorization_servers: [],
    bearer_methods_supported: ["header"],
    scopes_supported: ["mcp:tools", "mcp:resources", "mcp:prompts"],
    notes: "OAuth 2.1 is not enabled in v1. Bearer-token auth via Authorization: Bearer <MCP_API_KEY> is the only supported mechanism.",
  });
}
