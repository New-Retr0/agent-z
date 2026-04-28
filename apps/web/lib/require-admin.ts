import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ADMIN_COOKIE, verifyAdminToken } from "./admin-session";

export async function assertAdmin() {
  const secret = process.env.AGENT_Z_ADMIN_SECRET;
  const token = (await cookies()).get(ADMIN_COOKIE)?.value;
  if (verifyAdminToken(secret, token)) {
    return null;
  }
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
