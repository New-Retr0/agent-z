# Agent Z (monorepo)

## Stack

- **apps/web** — Next.js 16, Chat SDK Discord webhook at `POST /api/discord`, admin UI at `/admin` (password via `AGENT_Z_ADMIN_SECRET` + httpOnly cookie; Clerk is optional). Uses `runAgentZ` with in-process MCP tool calling via AI SDK 6.
- **apps/discord-mcp** — Streamable-HTTP MCP server exposing tier-gated Discord tools for both the internal agent and external MCP clients (Cursor, Claude Desktop, etc.).
- **Neon** — `DATABASE_URL` is standard PostgreSQL; same URL for **Prisma** and **`@chat-adapter/state-pg`**.
- **apps/gateway** — tiny optional `discord.js` Gateway relay. It forwards message/reaction Gateway events to Vercel `POST /api/discord`; it does not run agent logic.
- **Turborepo** — `npm run build` at the repo root.

## Environment

Copy `.env.example` to `.env` in the **repo root** and set at least:

- `DATABASE_URL` — Neon **pooled** string (Vercel Marketplace or [neon.tech](https://neon.tech)).
- `DISCORD_BOT_TOKEN`, `DISCORD_PUBLIC_KEY`, `DISCORD_APPLICATION_ID` — from the Discord application.
- `AI_GATEWAY_API_KEY` — Vercel AI Gateway (see `vercel env pull` / OIDC for local run).
- `AGENT_Z_ADMIN_SECRET` — long random string for `/admin` session.
- `AGENT_Z_INTERNAL_SECRET` — shared between Vercel and the Discord path for `POST /api/agent/direct` (chat-bot calls agent).
- `AGENT_Z_APP_BASE_URL` — e.g. `https://your-deployment.vercel.app` (or `http://localhost:3000` locally).

Optional: `VERCEL_URL` is set on Vercel; used as a fallback for internal URLs if `AGENT_Z_APP_BASE_URL` is missing. For mention/replies in channels, run the external `apps/gateway` relay (`npm run gateway`).

## Database

```bash
cd packages/db
npx prisma migrate deploy
```

Use `DIRECT_URL` (non-pooled) only if your Prisma migrate setup requires it for migrations; runtime uses the pooled `DATABASE_URL`.

## Local dev

```bash
npm install
npm run dev
```

- **Web** — [http://localhost:3000](http://localhost:3000)
- **Admin** — [http://localhost:3000/admin/login](http://localhost:3000/admin/login) after `AGENT_Z_ADMIN_SECRET` is set
- **Discord** — for local testing, use a tunnel (e.g. `cloudflared tunnel --url http://localhost:3000`) and set the **Interactions Endpoint URL** to `https://<public>/api/discord` in the Discord developer portal (and/or related webhook settings per Chat SDK / gateway docs).
  - Slash commands work over HTTP Interactions. Regular message mentions and reply threads require **Gateway forwarding**; run `npm run gateway` with `AGENT_Z_APP_BASE_URL` pointing at the public Vercel/tunnel origin.
  - In the Discord developer portal, enable Bot **Message Content Intent** and grant read message history, send messages, create/send in threads, and reaction permissions.

## Build / CI

```bash
npm run build
npm run lint
```

Use `SKIP_ENV_VALIDATION=1` only for analysis builds when secrets are absent; prefer a real `.env` locally.

## Production (Vercel)

1. Link the repo and set env vars in the Vercel project (match Neon + Discord + AI Gateway + the secrets above).
2. `vercel env pull` for local development if desired.
3. After deploy, point Discord to `https://<project>.vercel.app/api/discord` and set `AGENT_Z_APP_BASE_URL` to the same origin.
4. Run one Gateway relay for mention/reply UX (`npm run gateway` locally or as a tiny worker).

## MCP server (`apps/discord-mcp`)

The Discord MCP server is a Streamable-HTTP endpoint at `POST /api/mcp`. It exposes tier-gated Discord tools (moderation, channel info, role management, etc.) to both the internal agent via AI SDK 6's `experimental_createMCPClient` and external clients like Cursor or Claude Desktop. Configure MCP clients to connect to `https://<deployment>/api/mcp` with bearer auth using `AGENT_Z_INTERNAL_SECRET`.

## Legacy `bot/` folder

The old long-lived `discord.js` bot (if still present) is **deprecated** in favor of the Chat SDK + Vercel webhooks. See `bot/DEPRECATED.md`.
