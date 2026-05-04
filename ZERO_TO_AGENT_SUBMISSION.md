# Agent Z: Zero to Agent Submission Notes

## One-Liner

Agent Z is a durable Discord community operations agent that turns server conversations into auditable Vercel Workflow runs with role-aware AI tools and an admin control plane.

## Why It Fits Zero to Agent

- **ChatSDK Agents:** Discord slash commands and mentions are handled through the Chat SDK Discord adapter.
- **Workflows:** Each agent request starts a durable Vercel Workflow run, giving the bot crash-safe execution, persisted steps, and workflow IDs.
- **AI Gateway:** The configured model is managed through the app runtime config and AI Gateway-backed execution path.
- **Real-world utility:** Community operators can gate agent access by Discord role/channel, inspect run history, and keep disabled/destructive surfaces off by default.
- **Demo-ready presence:** An optional Gateway process can keep the bot online in Discord while Vercel continues to host the actual agent logic.

## What To Demo

1. Show the live Vercel deployment: `https://agent-z-theta.vercel.app`.
2. Open `/admin` and show model/config, allowed Discord role/channel, run history, and audit log.
3. In Discord `🏆-zta-hub`, run `/agent-z summarize this community and suggest one helpful next step`.
4. Point out the immediate started message with Workflow and AgentRun IDs.
5. Show the final Discord answer.
6. Return to `/admin/runs` and show the persisted run, step count, token usage, tier, and workflow ID.
7. If the judge cares about member-list status, run `npm run gateway` to show Agent Z online and explain that the Gateway only maintains presence.

## Verified Claims

- Local `npm test`, `npm run lint`, and `npm run build` pass.
- Production Vercel deployment `dpl_4ESKheiZ83D9x3UptzfjghAPdg9s` is ready and aliased to `https://agent-z-theta.vercel.app`.
- NewRetr0 was safely granted `Verified`, mapped to the `verified` tier, and allowed in `🏆-zta-hub`.
- A production workflow invoke using NewRetr0 context completed as `wrun_01KQKJ9B256CQXXQFDR5XQF5HE`.
- The corresponding `AgentRun` completed with persisted steps and usage.
- A post-deploy production invoke completed as `wrun_01KQKKKC2QC4AGYSP77T6TH52A` with 4 persisted steps.
- Discord slash commands are registered for the guild: `/agent-z` and `/help`.
- `npm run gateway` was smoke-tested and logged Agent Z online.

## Do Not Overclaim

- DMs are intentionally blocked.
- Reactions are intentionally inert.
- Discord confirmation buttons are intentionally disabled and point to the admin confirmations page.
- Rate limits are enforced for `user_rpm` and `global_rpm`, but the admin UI does not yet manage bypass user IDs.
- Mention handling requires Gateway forwarding; the Discord Interactions endpoint alone covers slash commands.

## Strong Next Enhancements

- Add richer knowledge content so the read-only `search_knowledge` tool can answer contest/community questions beyond the bundled stub.
- Add a visible run-status card/link in Discord so users can inspect workflow progress.
- Wire confirmation hooks only for genuinely sensitive actions, keeping destructive moderation disabled by default.

