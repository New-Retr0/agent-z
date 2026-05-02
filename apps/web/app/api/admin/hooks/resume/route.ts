import { resumeHook } from "workflow/api";
import { NextResponse } from "next/server";
import { assertAdmin } from "@/lib/require-admin";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const denied = await assertAdmin();
  if (denied) {
    return denied;
  }
  let body: { token?: string; approved?: boolean };
  try {
    body = (await request.json()) as { token?: string; approved?: boolean };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.token) {
    return NextResponse.json({ error: "token required" }, { status: 400 });
  }
  try {
    const hook = await resumeHook(body.token, { approved: body.approved === true });
    return NextResponse.json({ runId: hook.runId });
  } catch (error) {
    console.error("[api/admin/hooks/resume] resume failed", error);
    return NextResponse.json({ error: "Could not resume workflow hook" }, { status: 500 });
  }
}
