import { randomBytes } from "node:crypto";
import type { Actor } from "./auth";

/** Create a pending Discord mutation row on apps/web for button confirm/deny. */
export async function stagePendingActionFromMcp(args: {
  actor: Actor;
  capability: string;
  input: Record<string, unknown>;
  summary: string;
}): Promise<{ token: string } | { error: string }> {
  const base = process.env.AGENT_Z_APP_BASE_URL?.replace(/\/$/, "");
  const secret = process.env.AGENT_Z_INTERNAL_SECRET?.trim();
  if (!base || !secret) {
    return {
      error:
        "Staging is not configured on the MCP host. Set AGENT_Z_APP_BASE_URL and AGENT_Z_INTERNAL_SECRET (same as apps/web).",
    };
  }

  const uid = args.actor.userId;
  if (!uid) {
    return { error: "Missing actor user id for staging." };
  }

  const token = `pa_${randomBytes(16).toString("hex")}`;
  const expiresInSeconds = 300;

  const res = await fetch(`${base}/api/internal/staged/start`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${secret}`,
    },
    body: JSON.stringify({
      token,
      invokerUserId: uid,
      guildId: args.actor.guildId ?? null,
      channelId: args.actor.channelId ?? null,
      capability: args.capability,
      input: args.input,
      summary: args.summary,
      expiresInSeconds,
      interactionToken: args.actor.interactionToken ?? null,
      interactionApplicationId: args.actor.interactionApplicationId ?? null,
    }),
  });

  if (!res.ok) {
    const t = await res.text();
    return { error: `STAGING_FAILED status=${res.status} body=${t.slice(0, 200)}` };
  }

  return { token };
}
