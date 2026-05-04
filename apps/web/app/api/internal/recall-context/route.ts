import { NextResponse } from "next/server";
import { retrieveOversightSnippets } from "@/lib/agent-z/retrieval";

export const runtime = "nodejs";

function assertInternalAuth(request: Request): boolean {
  const secret = process.env.AGENT_Z_INTERNAL_SECRET?.trim();
  if (!secret) return false;
  const auth = request.headers.get("authorization")?.trim();
  return auth === `Bearer ${secret}`;
}

/**
 * POST JSON { query, channelId?, guildId?, limit? }
 * Returns { hits: OversightRecallHit[] } for MCP / diagnostics.
 */
export async function POST(request: Request) {
  if (!assertInternalAuth(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const raw = await request.json();
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return NextResponse.json({ error: "invalid_body" }, { status: 400 });
    }
    const query = typeof raw.query === "string" ? raw.query.trim() : "";
    if (!query) {
      return NextResponse.json({ error: "missing_query" }, { status: 400 });
    }
    const channelId =
      typeof raw.channelId === "string" && /^\d{17,20}$/.test(raw.channelId) ? raw.channelId : undefined;
    const guildId =
      typeof raw.guildId === "string" && /^\d{17,20}$/.test(raw.guildId) ? raw.guildId : undefined;
    const limit =
      typeof raw.limit === "number" && Number.isFinite(raw.limit) ? Math.floor(raw.limit) : undefined;

    const hits = await retrieveOversightSnippets({ query, channelId, guildId, limit });
    return NextResponse.json({ hits });
  } catch (e) {
    console.error("[recall-context POST]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
