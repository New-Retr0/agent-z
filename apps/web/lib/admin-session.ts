import { createHmac, timingSafeEqual } from "node:crypto";
import { ADMIN_HMAC_DATA } from "./admin-constants";

export { ADMIN_COOKIE } from "./admin-constants";

/**
 * Derives a stable session token from the server secret (single shared admin).
 */
export function getExpectedAdminToken(secret: string): string {
  return createHmac("sha256", secret).update(ADMIN_HMAC_DATA).digest("hex");
}

export function verifyAdminToken(secret: string | undefined, cookieValue: string | undefined): boolean {
  if (!secret || !cookieValue) {
    return false;
  }
  const a = Buffer.from(getExpectedAdminToken(secret), "utf8");
  const b = Buffer.from(cookieValue, "utf8");
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(a, b);
}
