import { NextResponse } from "next/server";
import {
  loadPendingActionByToken,
  updatePendingActionSummary,
} from "@repo/db";
import { refreshStagedActionInteractionMessage } from "@/lib/discord-staged-ui";

export const runtime = "nodejs";

function assertInternalAuth(request: Request): boolean {
  const secret = process.env.AGENT_Z_INTERNAL_SECRET?.trim();
  if (!secret) return false;
  const auth = request.headers.get("authorization")?.trim();
  return auth === `Bearer ${secret}`;
}

/** Internal: update the human-readable summary on a pending staged action (and refresh the Discord card when possible). */
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
    const summary = typeof raw.summary === "string" ? raw.summary.trim() : "";
    if (!token || !summary) {
      return NextResponse.json({ error: "missing_fields" }, { status: 400 });
    }

    const res = await updatePendingActionSummary({ token, summary });
    if (!res.count) {
      return NextResponse.json({ error: "no_pending_row" }, { status: 404 });
    }

    const latest = await loadPendingActionByToken(token);
    const refreshed =
      latest && latest.status === "pending"
        ? await refreshStagedActionInteractionMessage({
            token: latest.token,
            capability: latest.capability,
            summary: latest.summary,
            expiresAt: latest.expiresAt,
            interactionApplicationId: latest.interactionApplicationId,
            interactionToken: latest.interactionToken,
          }).catch(() => false)
        : false;

    return NextResponse.json({ ok: true, refreshed });
  } catch (e) {
    console.error("[pending-actions/edit-reason POST]", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
