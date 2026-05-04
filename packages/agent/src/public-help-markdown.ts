/** Shared plaintext used by non-Interactions surfaces (legacy Chat SDK slash) and echoed in richer Discord Interaction help embeds. */
export const PUBLIC_AGENT_Z_HELP_MARKDOWN =
  [
    "**Agent Z quick help**",
    "",
    "- `/agent-z text:<question>` — public tier-capped assistant (verification tools only for destructive ops).",
    "- `/agent-z-admin action:<request>` — staff ephemeral run; **admin** tier confirms staged destructive tools in Discord.",
    "- `/agent-z why` (mod+) — compact diagnostics for why tools/model routing look a certain way.",
    "- Staff: review **role → tier** mapping in `/admin/config` (no per-user owner override).",
    "- Verify-on-reaction rules live in Postgres **runtime_config** — seed with `npm run seed:config -w @repo/db` using `REACTION_VERIFIED_ROLE_ID`, `DISCORD_RULES_CHANNEL_ID`, optional `REACTION_MESSAGE_ID`, `REACTION_EMOJI`.",
  ].join("\n");
