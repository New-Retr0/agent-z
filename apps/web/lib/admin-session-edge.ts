import { ADMIN_COOKIE, ADMIN_HMAC_DATA } from "./admin-constants";

export { ADMIN_COOKIE };

/**
 * HMAC-SHA256(secret, ADMIN_HMAC_DATA) as hex — matches `getExpectedAdminToken` in admin-session (Node).
 */
async function hmacSecretHex(secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(ADMIN_HMAC_DATA));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqualString(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/** Edge / middleware: verify admin cookie (no node:crypto). */
export async function verifyAdminTokenEdge(
  secret: string | undefined,
  cookieValue: string | undefined
): Promise<boolean> {
  if (!secret || !cookieValue) {
    return false;
  }
  const expected = await hmacSecretHex(secret);
  return timingSafeEqualString(expected, cookieValue);
}
