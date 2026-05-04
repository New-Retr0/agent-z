# Deprecated: standalone `bot/` process

The production direction for Agent Z is the **Turborepo** in the **parent directory**:

- **Headless** Discord via **Chat SDK** and `apps/web` routes (`/api/discord`, `/api/agent/direct`).
- **No long-lived** `client.login()` process required for the main product.

This folder may remain for reference (reaction-role gateway, local experiments). Do not add new product features here; add them under `apps/web` and `packages/*`.

To remove this folder after you have verified parity in production, delete `bot/` in a single commit and update any personal scripts that pointed at it.
