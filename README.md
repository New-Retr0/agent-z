# Agent Z monorepo

Vercel-hosted Agent Z: Discord interactions via the **Chat SDK** webhooks, **Neon (PostgreSQL + pgvector)** for Prisma + chat state + the message archive, an **MCP-tooled** AI SDK 6 agent (`runAgentZ`) with Context7 docs grounding, and a private **/admin** control plane.

## Quick start

1. `npm install`
2. Copy each template: [`apps/web/env/.env.example`](apps/web/env/.env.example) → `apps/web/.env`, [`apps/discord-mcp/env/.env.example`](apps/discord-mcp/env/.env.example) → `apps/discord-mcp/.env` (if you run MCP locally), [`apps/gateway/env/.env.example`](apps/gateway/env/.env.example) → `apps/gateway/.env` (if you use `npm run gateway`).
3. `cd packages/db && npx prisma migrate deploy`
4. _(Recommended)_ Seed Discord verify/runtime toggles — `npm run seed:config -w @repo/db` (needs `DATABASE_URL`; see `packages/db/scripts/seed-runtime-config.ts`).
5. `npm run dev` — [http://localhost:3000](http://localhost:3000)

See **[AGENTS.md](./AGENTS.md)** for runbook detail (tunnels, production, MCP). Operator curl checks: **[docs/smoke-tests.md](./docs/smoke-tests.md)**.

## How Agent Z uses Vercel

| Primitive | Role in this repo |
|-----------|-------------------|
| **AI SDK 6** | `ToolLoopAgent`, embeddings, MCP client (`runAgentZ`) |
| **AI Gateway** | Unified chat + embedding models; observability in Vercel dashboard |
| **MCP (Streamable HTTP)** | Tier-gated `discord_*`, Oversight tools, staged writes (`apps/discord-mcp`) |
| **Workflow SDK** | Durable staged destructive actions — hook + timeout (`lib/workflows/staged-action.ts`) |
| **Cron** | Scheduled messages, Oversight embed batch (`apps/web/vercel.json`) |
| **Cache (`next/cache`)** | Runtime config, AI Gateway models payload, observability snapshot |
| **Neon + pgvector** | Chat history, archives, semantic recall |
| **Upstash Redis** | Embed queue, rate limits, short TTL recall cache |
| **Routing / Middleware** | Admin gate (`apps/web/proxy.ts` pattern) |

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
