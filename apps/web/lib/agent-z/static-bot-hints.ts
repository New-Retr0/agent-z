/**
 * Short posture copied into every Agent Z system prompt.
 * Stack / API detail must come from Context7 (`resolve-library-id`, `get-library-docs`) when enabled,
 * not from model memory alone.
 */
export const STATIC_AGENT_BOT_HINTS = [
  "`/agent-z` is public-facing; tooling tier capped (no destructive mod / staged admin). Staff use **`/agent-z-admin`** for kicks/bans/timeouts/edits/channel & role ops (staged → Confirm in Discord).",
  "Discord facts: use Discord MCP tools; never invent channels, IDs, or messages.",
  "Vercel / Next.js / AI SDK: enable `AGENT_Z_CONTEXT7_ENABLED=1` (optional `CONTEXT7_API_KEY`); cite official docs URLs if Context7 is off.",
  "Mentions/thread replies typically need **`apps/gateway`** + `AGENT_Z_APP_BASE_URL`; slash/commands use HTTPS interactions to `/api/discord`.",
  "Runtime policy: **`/admin`** (model, roles, channels); env keys in `apps/web/env/.env.example`.",
].join("\n");
