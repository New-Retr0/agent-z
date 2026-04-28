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
- `npm run mcp` — start `@repo/mcp` dev server (if configured)

## License

Private / your policy.
