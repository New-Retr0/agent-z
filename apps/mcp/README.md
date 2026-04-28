# @repo/mcp

Local MCP server exposing Discord REST helpers for Cursor. Uses the same **Discord bot token** and allowlists as the main app (see root `.env.example`).

**Shared with the monorepo:** environment variables and operational guild/role policy should stay aligned with `apps/web` and `packages/config` runtime data. Optional next step: import `DATABASE_URL` and read `RoleMapping` from Prisma so role IDs always match the admin UI.

## Run

```bash
npm run mcp
# or
npm start -w @repo/mcp
```

With `DISCORD_BOT_TOKEN` in the environment (or `.env` loaded the same way you load the rest of the repo).
