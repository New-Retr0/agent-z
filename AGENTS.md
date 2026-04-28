# Agent Z (monorepo)

## Stack

- **apps/web** — Next.js 16, Workflow DevKit (`runAgentZWorkflow`), Chat SDK Discord webhook at `POST /api/discord`, admin UI at `/admin` (password via `AGENT_Z_ADMIN_SECRET` + httpOnly cookie; Clerk is optional).
- **Neon** — `DATABASE_URL` is standard PostgreSQL; same URL for **Prisma** and **`@chat-adapter/state-pg`**.
- **Turborepo** — `npm run build` at the repo root.

## Environment

Copy `.env.example` to `.env` in the **repo root** and set at least:

- `DATABASE_URL` — Neon **pooled** string (Vercel Marketplace or [neon.tech](https://neon.tech)).
- `DISCORD_BOT_TOKEN`, `DISCORD_PUBLIC_KEY`, `DISCORD_APPLICATION_ID` — from the Discord application.
- `AI_GATEWAY_API_KEY` — Vercel AI Gateway (see `vercel env pull` / OIDC for local run).
- `AGENT_Z_ADMIN_SECRET` — long random string for `/admin` session.
- `AGENT_Z_INTERNAL_SECRET` — shared between Vercel and the Discord path for `POST /api/workflow/invoke` (bot invokes workflows).
- `AGENT_Z_APP_BASE_URL` — e.g. `https://your-deployment.vercel.app` (or `http://localhost:3000` locally).

Optional: `VERCEL_URL` is set on Vercel; used as a fallback for internal URLs if `AGENT_Z_APP_BASE_URL` is missing.

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
  - Slash commands work over HTTP Interactions. Regular message mentions and reaction handlers require Discord Gateway forwarding; do not expect them to fire from the Interactions endpoint alone.

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

## MCP server (`apps/mcp`)

Runs as a **separate** Node process for Cursor/MCP. Use the same `.env` for `DISCORD_BOT_TOKEN` and guild/role allowlists. Optional future work: read role mappings from the same Neon DB via Prisma in this app.

## Legacy `bot/` folder

The old long-lived `discord.js` bot (if still present) is **deprecated** in favor of the Chat SDK + Vercel webhooks. See `bot/DEPRECATED.md`.
