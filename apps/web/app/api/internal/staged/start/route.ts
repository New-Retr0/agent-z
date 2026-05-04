import { NextResponse } from "next/server";
import { createPendingAction } from "@repo/db";

export const runtime = "nodejs";

function assertInternalAuth(request: Request): boolean {
  const secret = process.env.AGENT_Z_INTERNAL_SECRET?.trim();
  if (!secret) return false;
  const auth = request.headers.get("authorization")?.trim();
  return auth === `Bearer ${secret}`;
}

/**
 * Canonical staging entry from MCP (`stagePendingActionFromMcp`).
 * Persists `pending_action` and starts a durable **Workflow SDK** run that waits for
 * Confirm/Cancel (`resumeHook`) or times out (~5m).
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

    try {
      const { start } = await import("workflow/api");
      const { stagedDestructiveActionWorkflow } = await import("@/lib/workflows/staged-action");
      await start(stagedDestructiveActionWorkflow, [token]);
    } catch (e) {
      console.error("[staged/start] workflow start failed:", e);
    }

    return NextResponse.json({ ok: true, token });
  } catch (e) {
    console.error("[staged/start POST]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
