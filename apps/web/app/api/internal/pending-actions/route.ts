import { NextResponse } from "next/server";
import { createPendingAction, loadPendingActionByToken, resolvePendingAction } from "@repo/db";

export const runtime = "nodejs";

function assertInternalAuth(request: Request): boolean {
  const secret = process.env.AGENT_Z_INTERNAL_SECRET?.trim();
  if (!secret) return false;
  const auth = request.headers.get("authorization")?.trim();
  return auth === `Bearer ${secret}`;
}

/**
 * POST: create staged pending mutation (Discord confirm flow).
 * Body: token, invokerUserId, guildId?, channelId?, capability, input (object), summary, expiresInSeconds?, interactionToken?, interactionApplicationId?
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
    const token = typeof raw.token === "string" ? raw.token.trim() : "";
    const invokerUserId = typeof raw.invokerUserId === "string" ? raw.invokerUserId.trim() : "";
    const capability = typeof raw.capability === "string" ? raw.capability.trim() : "";
    const summary = typeof raw.summary === "string" ? raw.summary.trim() : "";
    const input = raw.input;
    if (!token || !invokerUserId || !capability || !summary) {
      return NextResponse.json({ error: "missing_fields" }, { status: 400 });
    }
    const expiresIn =
      typeof raw.expiresInSeconds === "number" && Number.isFinite(raw.expiresInSeconds)
        ? Math.min(Math.max(raw.expiresInSeconds, 60), 3600)
        : 300;
    const expiresAt = new Date(Date.now() + expiresIn * 1000);
    const guildId =
      typeof raw.guildId === "string" && /^\d{17,20}$/.test(raw.guildId) ? raw.guildId : null;
    const channelId =
      typeof raw.channelId === "string" && /^\d{17,20}$/.test(raw.channelId) ? raw.channelId : null;
    let inputJson: string;
    try {
      inputJson = JSON.stringify(input ?? {});
    } catch {
      return NextResponse.json({ error: "input_not_json_serializable" }, { status: 400 });
    }

    await createPendingAction({
      token,
      invokerUserId,
      guildId,
      channelId,
      capability,
      inputJson,
      summary,
      expiresAt,
      interactionToken:
        typeof raw.interactionToken === "string" && raw.interactionToken.trim().length > 0
          ? raw.interactionToken.trim()
          : undefined,
      interactionApplicationId:
        typeof raw.interactionApplicationId === "string" && raw.interactionApplicationId.trim().length > 0
          ? raw.interactionApplicationId.trim()
          : undefined,
    });

    return NextResponse.json({ ok: true, token });
  } catch (e) {
    console.error("[pending-actions POST]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

/** GET ?token= for diagnostics / MCP follow-up */
export async function GET(request: Request) {
  if (!assertInternalAuth(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const url = new URL(request.url);
  const token = url.searchParams.get("token")?.trim();
  if (!token) {
    return NextResponse.json({ error: "missing_token" }, { status: 400 });
  }
  const row = await loadPendingActionByToken(token);
  if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({
    token: row.token,
    capability: row.capability,
    status: row.status,
    summary: row.summary,
    invokerUserId: row.invokerUserId,
    expiresAt: row.expiresAt.toISOString(),
  });
}

/** PATCH resolve { token, status, resultText } */
export async function PATCH(request: Request) {
  if (!assertInternalAuth(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const raw = await request.json();
    const token = typeof raw?.token === "string" ? raw.token.trim() : "";
    const status = typeof raw?.status === "string" ? raw.status.trim() : "";
    if (
      !token ||
      !["executed", "cancelled", "expired", "failed"].includes(status)
    ) {
      return NextResponse.json({ error: "invalid_body" }, { status: 400 });
    }
    const result =
      typeof raw?.resultText === "string"
        ? raw.resultText.trim()
        : raw?.resultText === null || raw?.resultText === undefined
          ? null
          : String(raw.resultText);

    const updated = await resolvePendingAction({
      token,
      status: status as "executed" | "cancelled" | "expired" | "failed",
      resultText: result,
    });
    if (!updated.count) {
      return NextResponse.json({ error: "nothing_to_resolve" }, { status: 409 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[pending-actions PATCH]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
