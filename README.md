# Agent Z monorepo

Vercel-hosted Agent Z: Discord interactions via the **Chat SDK** webhooks, **Neon (PostgreSQL)** for Prisma + chat state, **Workflow DevKit** for durable runs, and a private **/admin** control plane.

## Quick start

1. `npm install`
2. Copy `.env.example` → `.env` and fill in Neon, Discord, AI Gateway, and `AGENT_Z_*` secrets.
3. `cd packages/db && npx prisma migrate deploy`
4. `npm run dev` — [http://localhost:3000](http://localhost:3000)

See **[AGENTS.md](./AGENTS.md)** for runbook detail (tunnels, production, MCP).

## Packages

| Path | Role |
|------|------|
| `apps/web` | Next.js app: `/api/discord`, `/api/workflow/invoke`, `/admin` |
| `apps/gateway` | Tiny Discord Gateway relay that forwards replies/mentions to Vercel |
| `apps/mcp` | Optional MCP server (Discord tools for Cursor) |
| `packages/db` | Prisma schema + client |
| `packages/config` | `env` + `runtime-config` (cached) |
| `packages/agent` | Gateway model helpers + **tier tools** for `DurableAgent` |
| `packages/chat-bot` | Chat + Discord + Postgres state |
| `packages/ui` | Shared UI (Tailwind v4) |
| `packages/knowledge` | Bundled docs for the agent |

## Scripts

- `npm run build` — Turborepo production build
- `npm run dev` — develop all workspaces
- `npm run gateway` — optional long-lived Discord Gateway relay for replies/mentions/reactions
- `npm run mcp` — start `@repo/mcp` dev server (if configured)

## Discord Online Status

The Vercel app uses Discord Interactions/webhooks for slash commands and buttons. Normal Discord replies, mentions, and reactions require Gateway events, so the optional Gateway process acts as a thin relay into `POST /api/discord`.

For demos where reply/mention UX matters, run the optional Gateway relay:

```bash
npm run gateway
```

This process does not handle Agent Z logic. It forwards raw Gateway events to Vercel, keeps the bot online, and sets its activity. The AI, Workflow DevKit runs, admin UI, audit logs, and database state remain hosted in `apps/web`.

Run only one Gateway owner for a bot token. Prefer `npm run gateway` for the competition demo; the Vercel `/api/discord/gateway` listener is a disabled fallback unless `ENABLE_VERCEL_GATEWAY_LISTENER=true` is set.

## License

Private / your policy.
