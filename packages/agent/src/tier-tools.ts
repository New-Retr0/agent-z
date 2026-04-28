import { z } from "zod";
import type { AgentTier } from "./types.js";

export type TierToolContext = { tier: AgentTier };

/**
 * Tier-scoped tool definitions for `DurableAgent` (description + inputSchema + execute).
 * Kept as plain objects to keep `tsc` fast (avoid heavy `ai` `tool()` generic instantiation).
 */
export function getToolsForTier(tier: AgentTier) {
  const tools = {
    ping: {
      description: "Health check — returns the active tier.",
      inputSchema: z.object({}),
      execute: async (
        _input: Record<string, never>,
        options: { experimental_context?: unknown }
      ) => {
        const ctx = options.experimental_context as TierToolContext | undefined;
        return { ok: true, tier: ctx?.tier ?? tier };
      },
    },
    summarize_intent: {
      description: "Log a one-phrase summary of the user's goal.",
      inputSchema: z.object({ phrase: z.string() }),
      execute: async ({ phrase }: { phrase: string }) => ({ logged: phrase }),
    },
    mod_note: {
      description: "Record a moderation note (mod/admin).",
      inputSchema: z.object({ note: z.string() }),
      execute: async (
        { note }: { note: string },
        options: { experimental_context?: unknown }
      ) => {
        const ctx = options.experimental_context as TierToolContext | undefined;
        return { saved: true, tier: ctx?.tier, note };
      },
    },
    admin_config_hint: {
      description:
        "Tell the user that roles, model, and channels are configured in the /admin web UI.",
      inputSchema: z.object({}),
      execute: async () => ({
        message:
          "Use the Agent Z admin UI (/admin) to change model, roles, channels, and feature flags.",
      }),
    },
  } as const;

  if (tier === "admin") {
    return {
      ping: tools.ping,
      summarize_intent: tools.summarize_intent,
      mod_note: tools.mod_note,
      admin_config_hint: tools.admin_config_hint,
    };
  }
  if (tier === "mod") {
    return { ping: tools.ping, summarize_intent: tools.summarize_intent, mod_note: tools.mod_note };
  }
  return { ping: tools.ping, summarize_intent: tools.summarize_intent };
}
