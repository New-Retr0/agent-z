# Discord Online Status

Agent Z can work from Vercel while appearing offline in Discord.

Discord slash commands are HTTP Interactions. They hit `POST /api/discord` on Vercel, so no always-on bot connection is required. The member list is different: Discord shows a bot as online only while a process is connected to the Discord Gateway WebSocket with `client.login(...)`.

## Production Shape

- **Vercel app:** Handles `/api/discord`, starts workflows, persists runs, and posts replies.
- **Optional Gateway app:** Keeps the Discord bot online for demos and presence. It does not own Agent Z logic.

## Run Presence Locally

```bash
npm run gateway
```

The process reads `DISCORD_BOT_TOKEN` from the repo `.env` and logs when Agent Z is online.

## Hosting Presence

Do not deploy the Gateway presence process to Vercel Functions. Vercel Functions are request/response compute and cannot hold a Discord Gateway WebSocket open indefinitely.

Use a long-running host if you need 24/7 online presence, such as:

- a local machine during the demo,
- a small VPS,
- Railway/Fly.io/Render worker,
- Docker on any always-on host.

The Gateway process is optional. The contest demo can still show real agent behavior through slash commands even if the bot appears offline.

