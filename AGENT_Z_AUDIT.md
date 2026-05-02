# Agent Z Full-Flow Audit

## Product Story

Agent Z is a Vercel-hosted Discord community operations agent. Discord users trigger it with slash commands or mentions, the Chat SDK normalizes the event, a protected internal API starts a durable Workflow run, and the workflow uses a tier-scoped `DurableAgent` to produce an answer that is persisted and posted back to Discord.

The contest positioning is strongest when framed as a real community agent built across two Zero to Agent tracks: ChatSDK Agents for Discord ingress and Vercel Workflow for durable, auditable agent execution.

## Baseline Evidence

| Area | Evidence | Status |
| --- | --- | --- |
| Local lint | `npm run lint` completed successfully through Turborepo. | Pass |
| Local build | `npm run build` completed successfully and produced 1 Workflow, 12 steps, and the expected Next.js routes. | Pass |
| Build warning | The deprecated `middleware` convention was migrated to `proxy.ts`; the follow-up build completed without that warning. | Fixed |
| Vercel project | `agent-z`, root directory `apps/web`, Next.js preset, Node 24.x, install `npm install`, build `npm run build`. | Pass |
| Production deployment | `https://agent-z-theta.vercel.app` resolves to a ready production deployment. | Pass |
| Production env names | Required names for Discord, database, AI Gateway, admin secret, internal secret, and app base URL are configured in Production/Preview/Development. | Pass |
| Vercel logs | Recent production and production error log queries returned no rows. | Observability gap |
| Workflow runs | Initial Workflow run list was empty. A later live invoke created and completed `wrun_01KQKJ9B256CQXXQFDR5XQF5HE`. | Pass |
| Final deployment | Production redeployed to `dpl_4ESKheiZ83D9x3UptzfjghAPdg9s` and aliased to `https://agent-z-theta.vercel.app`. | Pass |

## Capability Matrix

| Capability | Entry Point | Expected Behavior | Current Audit Result |
| --- | --- | --- | --- |
| Slash help | `/agent-z help`, `/help` | Posts command guidance in the channel. | Implemented in `packages/chat-bot/src/handlers/slash.ts`. |
| Slash prompt | `/agent-z <prompt>` | Builds Discord context, calls `/api/workflow/invoke`, posts a started message, then final workflow result. | Handler and invoke behavior covered by tests. Live backend invoke with NewRetr0 context starts a verified-tier workflow after config fix. |
| Mention prompt | Bot mention in a thread/channel | Removes the bot mention, starts workflow, posts started/final replies in thread. | Handler covered by tests. Requires Gateway-style event forwarding beyond Discord Interactions for real mentions. |
| Direct message | DM to bot | Refuses with guild-only guidance and does not start a workflow. | Covered by tests and intentionally blocked. |
| Reaction | Checkmark reaction | No mutation; logs disabled automation. | Covered by tests as intentionally inert. Safe for contest but should not be marketed as active. |
| Confirm button action | `confirm:*` Chat SDK action | Refuses Discord confirmation and points to admin confirmations page. | Covered by tests as intentionally inert for Discord. |
| Internal workflow invoke | `POST /api/workflow/invoke` | Requires Bearer secret, validates prompt/context, resolves tier/channel access, creates `AgentRun`, starts Workflow. | Live verified: first denied NewRetr0 with missing policy, then succeeded after role/channel mapping fix. |
| Admin workflow run | `POST /api/workflow/run` | Requires admin cookie, creates `AgentRun`, starts Workflow without Discord reply target. | Implemented. Needs route-level or behavior tests. |
| Durable agent run | `runAgentZWorkflow` | Runs `DurableAgent` with tier tools, persists finish/failure, posts final Discord reply when a target exists. | Live verified: `AgentRun` completed with 3 steps and persisted usage. Reply chunk formatting covered by tests. |
| Tier tools | `getToolsForTier` | Public/verified get safe tools; mod gets moderation note; admin gets config hint. | Implemented. Tool effects are currently stub-like, not real moderation. |
| Access policy | `resolveDiscordAccess` | Denies DMs, enforces mapped channels when present, maps roles by priority, optionally allows public tier. | Covered by table-driven tests. Live policy now maps `Verified` to `verified` and `🏆-zta-hub` as the allowed agent channel. |
| Rate limits | Prisma `RateLimit` | Constrain usage when configured. | Implemented for `user_rpm` and `global_rpm` in `/api/workflow/invoke`. |
| Confirmations | Prisma `Confirmation`, admin hooks | Should support human approval if product claims it. | Partially scaffolded; not wired into Agent Z workflow. |
| Admin AI smoke test | `POST /api/admin/test-prompt` | Requires admin and AI Gateway key, runs a concise prompt using configured model. | Implemented. Needs authenticated browser/admin verification. |
| Vercel deployment | Vercel production app | Hosts Next.js routes plus Workflow endpoints under `.well-known/workflow`. | Implemented and ready. |

## Non-Destructive Live Test Boundary

Live Discord tests may use the `NewRetr0` user only for safe command, role/channel allowlist, and visible message checks. Do not ban, kick, timeout, delete messages, or run destructive moderation. Reaction and confirm action paths are expected to be non-mutating.

## Fixes Applied

- Added `vitest` and `npm test` so the audit can be repeated.
- Added 26 tests covering request parsing, secret comparison, Discord access policy, workflow invocation, Chat SDK handlers, Discord reply chunking, and admin hook resume behavior.
- Expanded to 32 tests covering rate-limit enforcement and the new knowledge-search tool.
- Enforced `user_rpm` and `global_rpm` rate limits in `/api/workflow/invoke`.
- Added a read-only `search_knowledge` tool available to every tier.
- Added an optional `apps/gateway` process plus `npm run gateway` so Agent Z can appear online during demos.
- Added `.vercelignore` so CLI deployments do not upload local artifacts.
- Changed admin hook resume failures from unhandled errors to structured `{ error: "Could not resume workflow hook" }` responses.
- Exported `formatDiscordChunks` for focused verification of Discord message chunking and empty-output fallback behavior.
- Migrated `apps/web/middleware.ts` to `apps/web/proxy.ts` for Next.js 16 compatibility.
- Live-configured NewRetr0 safely: granted the existing `Verified` role, mapped `Verified` to Agent Z's `verified` tier, and restricted Agent Z access to `🏆-zta-hub`.

## Live Verification Results

| Check | Result |
| --- | --- |
| Discord bot identity | Bot is `Agent Z` in the `Zero to Agent` guild. |
| NewRetr0 lookup | Found `NewRetr0` as user `473373828937154591`. Initial role count was `0`. |
| Initial access smoke | Production `/api/workflow/invoke` returned `403` with `You need a mapped Discord role to run Agent Z.` |
| Live config fix | Added `Verified` role to NewRetr0, created `RoleMapping(kind=verified)`, created `ChannelMapping(kind=agent)` for `🏆-zta-hub`, and wrote an `AuditLog` entry. |
| Post-fix invoke | Production `/api/workflow/invoke` returned `200`, run `wrun_01KQKJ9B256CQXXQFDR5XQF5HE`, AgentRun `b330202b-22ed-4ab1-9b36-f2937f95cec4`, tier `verified`. |
| Workflow status | Workflow CLI reported the run as `completed`. |
| Database persistence | `AgentRun` status is `completed`, `stepCount=3`, `tokensIn=1594`, `tokensOut=136`, with persisted step usage. |
| Post-deploy invoke | New production deploy returned `200`, run `wrun_01KQKKKC2QC4AGYSP77T6TH52A`, AgentRun `657204e0-c8b9-4f3a-a927-9d7a1c0ab045`, tier `verified`. |
| Post-deploy persistence | The post-deploy run completed with `stepCount=4`, confirming the new knowledge tool step is bundled and executable. |
| Slash commands | Guild commands are registered: `/agent-z` with `prompt` and `help` subcommands, plus `/help`. |
| Gateway presence | `npm run gateway` logged Agent Z online, then the smoke process was stopped. |
| Vercel logs | Log queries still returned no rows, so request-level observability remains weak from CLI logs. Workflow CLI and Prisma provided the useful evidence. |

## Demo Script

1. Open the Vercel project and show `agent-z` deployed at `https://agent-z-theta.vercel.app`.
2. Show the admin UI as the control plane: model config, runs, audit log, and role/channel configuration.
3. In Discord, use `🏆-zta-hub` with a verified user and run `/agent-z summarize what this server is for and suggest one helpful next action`.
4. Show the immediate "started" message with workflow/run IDs.
5. Show the final Agent Z reply in Discord.
6. Open `/admin/runs` and show the corresponding persisted run, tier, steps, token usage, and Workflow run ID.
7. Explain disabled surfaces honestly: DMs are guild-only, reactions are intentionally inert, Discord confirmation buttons route users to admin confirmations, and destructive moderation is not enabled.
8. If the member list needs to show Agent Z online, run `npm run gateway` during the demo. Explain that Vercel handles slash commands while the Gateway process only maintains presence.

## Remaining Gaps

- Real slash-command and final Discord reply should be manually confirmed in `🏆-zta-hub` from the Discord client UI.
- Mentions require Discord Gateway forwarding; the Interactions endpoint alone does not prove mention handling.
- Rate limits are now enforced for `user_rpm` and `global_rpm`; the admin UI does not yet expose bypass user IDs.
- Confirmation records and admin hook resume exist, but Agent Z does not yet create confirmation hooks in its main workflow.
- The current tier tools are safe and mostly read-only; do not claim destructive moderation powers.

