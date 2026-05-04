# Agent Z monorepo

Vercel-hosted Agent Z: Discord interactions via the **Chat SDK** webhooks, **Neon (PostgreSQL + pgvector)** for Prisma + chat state + the message archive, an **MCP-tooled** AI SDK 6 agent (`runAgentZ`) with Context7 docs grounding, and a private **/admin** control plane.

## Quick start

1. `npm install`
2. Copy `.env.example` → `.env` and fill in Neon, Discord, AI Gateway, and `AGENT_Z_*` secrets.
3. `cd packages/db && npx prisma migrate deploy`
4. `npm run dev` — [http://localhost:3000](http://localhost:3000)

See **[AGENTS.md](./AGENTS.md)** for runbook detail (tunnels, production, MCP).

## Packages

| Path | Role |
|------|------|
| `apps/web` | Next.js app: `/api/discord`, `/api/agent/direct`, `/api/discord/verify`, `/api/discord/oversight`, `/api/cron/*`, `/admin` |
| `apps/gateway` | Long-lived Discord Gateway relay that forwards mentions, reactions, and message create/update/delete events into the web app |
| `apps/discord-mcp` | Streamable-HTTP MCP server exposing tier-gated Discord tools (Cursor / Claude Desktop / `runAgentZ`) |
| `packages/db` | Prisma schema + client |
| `packages/config` | `env` + `runtime-config` (cached) |
| `packages/agent` | Gateway model helpers + **tier tools** for `DurableAgent` |
| `packages/chat-bot` | Chat + Discord + Postgres state |
| `packages/ui` | Shared UI (Tailwind v4) |
| `packages/knowledge` | Bundled docs for the agent |

## Scripts

- `npm run build` — Turborepo production build
- `npm run dev` — develop all workspaces
- `npm run gateway` — long-lived Discord Gateway relay for mentions, reactions, and (with `AGENT_Z_OVERSIGHT_ENABLED=true`) the message archive tee

## Discord Online Status

The Vercel app uses Discord Interactions/webhooks for slash commands and buttons. Mentions, reactions, DMs, and the message-archive ingest require Gateway events, so the long-lived `apps/gateway` process acts as the relay into `POST /api/discord` (mentions/reactions) and `POST /api/discord/oversight` (archive tee).

```bash
npm run gateway
```

This process does not run any agent logic — it forwards raw Gateway events, keeps the bot online, and sets its activity. All AI, MCP tools, admin UI, cron jobs, and database state stay in `apps/web`. Run exactly one Gateway owner per bot token.

## License

Private / your policy.
