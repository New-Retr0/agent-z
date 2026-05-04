# Agent Z — Vercel Workflow

Destructive Discord mutations flow through **`POST /api/internal/staged/start`**, which:

1. Writes a `pending_action` row (opaque `pa_*` token).
2. Starts **`stagedDestructiveActionWorkflow`** via `workflow/api` `start(...)` — durable wait for Confirm/Cancel.

The workflow implementation lives in [`staged-action.ts`](./staged-action.ts):

- **`createHook`** with deterministic token `az-staged:<paToken>` suspends until **`resumeHook`** fires from Discord component handlers (`app/api/discord/interaction-handlers.ts`).
- **`sleep("5m")`** races the hook so expiry does not require a SQL cron sweep.

Confirm/Cancel handlers PATCH a short ephemeral ack, then **`resumeHook`**. Final Discord content + DB resolution happen inside the workflow **`use step`** function.
