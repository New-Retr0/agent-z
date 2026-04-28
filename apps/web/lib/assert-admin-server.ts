import { cookies } from "next/headers";
import { ADMIN_COOKIE, verifyAdminToken } from "./admin-session";

export async function assertAdminServer(): Promise<void> {
  const secret = process.env.AGENT_Z_ADMIN_SECRET;
  const token = (await cookies()).get(ADMIN_COOKIE)?.value;
  if (!verifyAdminToken(secret, token)) {
    throw new Error("Unauthorized");
  }
}
