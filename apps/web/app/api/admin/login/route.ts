import { NextResponse } from "next/server";
import { getExpectedAdminToken, ADMIN_COOKIE } from "@/lib/admin-session";
import { timingSafeSecretEqual } from "@/lib/workflow-request";
import { env } from "@repo/config/env";

export async function POST(request: Request) {
  if (!env.AGENT_Z_ADMIN_SECRET) {
    return NextResponse.json({ error: "AGENT_Z_ADMIN_SECRET not configured" }, { status: 503 });
  }
  let password: string | undefined;
  try {
    const body = (await request.json()) as { password?: unknown };
    password = typeof body.password === "string" ? body.password : undefined;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!timingSafeSecretEqual(password, env.AGENT_Z_ADMIN_SECRET)) {
    return NextResponse.json({ error: "Invalid password" }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE, getExpectedAdminToken(env.AGENT_Z_ADMIN_SECRET), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return res;
}
