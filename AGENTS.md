# Agent Z (monorepo)

## Stack

- **apps/web** — Next.js 16, Chat SDK Discord webhook at `POST /api/discord`, admin UI at `/admin` (password via `AGENT_Z_ADMIN_SECRET` + httpOnly cookie; Clerk is optional). Uses `runAgentZ` with in-process MCP tool calling via AI SDK 6.
- **apps/discord-mcp** — Streamable-HTTP MCP server exposing tier-gated Discord tools for both the internal agent and external MCP clients (Cursor, Claude Desktop, etc.).
- **Neon** — `DATABASE_URL` is standard PostgreSQL; same URL for **Prisma** and **`@chat-adapter/state-pg`**.
- **apps/gateway** — tiny optional `discord.js` Gateway relay. It forwards message/reaction Gateway events to Vercel `POST /api/discord`; it does not run agent logic.
- **Turborepo** — `npm run build` at the repo root.

## Environment

Environment templates live **per app** under `apps/<name>/env/.env.example`: [`apps/web/env/.env.example`](apps/web/env/.env.example), [`apps/discord-mcp/env/.env.example`](apps/discord-mcp/env/.env.example), [`apps/gateway/env/.env.example`](apps/gateway/env/.env.example). Copy each to `apps/web/.env`, `apps/discord-mcp/.env`, and `apps/gateway/.env` respectively. Next.js reads `apps/web/.env`; the gateway relay reads `apps/gateway/.env` only.

Set at least:

- `DATABASE_URL` — Neon **pooled** string (Vercel Marketplace or [neon.tech](https://neon.tech)).
- `DISCORD_BOT_TOKEN`, `DISCORD_PUBLIC_KEY`, `DISCORD_APPLICATION_ID` — from the Discord application.
- `AI_GATEWAY_API_KEY` — Vercel AI Gateway (see `vercel env pull` / OIDC for local run).
- `AGENT_Z_ADMIN_SECRET` — long random string for `/admin` session.
- `AGENT_Z_INTERNAL_SECRET` — shared secret for `POST /api/agent/direct`, `POST /api/discord/verify`, selected cron routes, and `POST /api/internal/staged/start` (MCP staged actions → apps/web).
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
  - Slash commands work over HTTP Interactions. Regular message mentions and reply threads require **Gateway forwarding**; run `npm run gateway` with `AGENT_Z_APP_BASE_URL` pointing at the public Vercel/tunnel origin (same origin as production **apps/web** — set this on Vercel for the web project too).
  - Gateway worker env: `DISCORD_BOT_TOKEN`, `AGENT_Z_APP_BASE_URL`, `AGENT_Z_MESSAGE_CONTENT_INTENT=1` (and matching **Message Content Intent** in the Developer Portal). Optional: `DISCORD_MENTION_ROLE_IDS` (comma-separated role snowflakes) so `@Role` pings trigger without `@Bot`.
  - In the Discord developer portal, enable Bot **Message Content Intent** and grant read message history, send messages, create/send in threads, and reaction permissions.

## Build / CI

```bash
npm run build
npm run lint
```

Use `SKIP_ENV_VALIDATION=1` only for analysis builds when secrets are absent; prefer real `apps/web/.env` (and other app `.env` files) locally.

## Production (Vercel)

1. Link the repo and set env vars in the Vercel project (match Neon + Discord + AI Gateway + the secrets above).
2. `vercel env pull` for local development if desired.
3. After deploy, point Discord to `https://<project>.vercel.app/api/discord` and set `AGENT_Z_APP_BASE_URL` to the same origin.
4. Run one Gateway relay for mention/reply UX (`npm run gateway` locally or as a tiny worker).

## MCP server (`apps/discord-mcp`)

The Discord MCP server is a Streamable-HTTP endpoint at `POST /api/mcp`. It exposes tier-gated Discord tools (moderation, channel info, role management, etc.) to both the internal agent via AI SDK 6's `createMCPClient` and external clients like Cursor or Claude Desktop. Configure MCP clients to connect to `https://<deployment>/api/mcp` with bearer auth using **`MCP_API_KEY`** (set on the MCP Vercel project). The in-app agent uses **`DISCORD_MCP_URL`** + **`DISCORD_MCP_API_KEY`** on apps/web; set `DISCORD_MCP_API_KEY` to the same value as `MCP_API_KEY` unless you intentionally use different secrets.