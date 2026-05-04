/**
 * Shared base-URL resolver for the chat-bot's outbound calls into apps/web.
 *
 * Previously inlined in `invoke-workflow.ts`, which we removed when the
 * Workflow SDK was retired (Phase 7 cleanup). The remaining HTTP-bridge
 * helpers — `invoke-direct.ts` and `invoke-verify.ts` — share this resolver
 * so they all agree on which Vercel deployment to talk to.
 *
 * Resolution order:
 *   1. AGENT_Z_APP_BASE_URL — preferred, set explicitly per environment.
 *   2. VERCEL_URL — set automatically on Vercel deployments; we add `https://`.
 *   3. http://localhost:3000 — last-ditch local fallback.
 */
export function getBaseUrl(): string {
  const explicit = process.env.AGENT_Z_APP_BASE_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel.replace(/^https?:\/\//, "").replace(/\/$/, "")}`;
  return "http://localhost:3000";
}
