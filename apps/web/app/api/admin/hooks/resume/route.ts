import { resumeHook } from "workflow/api";
import { NextResponse } from "next/server";
import { assertAdmin } from "@/lib/require-admin";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const denied = await assertAdmin();
  if (denied) {
    return denied;
  }
  const body = (await request.json()) as { token?: string; approved?: boolean };
  if (!body.token) {
    return NextResponse.json({ error: "token required" }, { status: 400 });
  }
  const hook = await resumeHook(body.token, { approved: body.approved === true });
  return NextResponse.json({ runId: hook.runId });
}
