import type { DiscordToolConfig } from "@repo/discord-tools";
import { loadDiscordToolConfig } from "@repo/discord-tools";
import { getRuntimeConfig } from "@repo/config/runtime-config";
import { z } from "zod";

let discordConfigMemo: { cfg: DiscordToolConfig; expires: number } | null = null;

export async function resolveDiscordToolConfigForMcp(): Promise<DiscordToolConfig> {
  const now = Date.now();
  if (discordConfigMemo && discordConfigMemo.expires > now) {
    return discordConfigMemo.cfg;
  }
  const rc = await getRuntimeConfig();
  const cfg = loadDiscordToolConfig(process.env, {
    reactionVerifiedRoleIdFromDb: rc.verifiedRoleId,
    allowDeleteVerifiedRoleFromDb: rc.allowDeleteVerifiedRole,
  });
  discordConfigMemo = { cfg, expires: now + 30_000 };
  return cfg;
}
import type { Actor } from "../auth";
import { meetsTier, resolveTier, type Tier } from "../tier";

export type McpToolContext = {
  authInfo?: {
    extra?: {
      actor?: Actor;
    };
  };
  request?: {
    sendRequest?: (
      method: string,
      params: unknown,
      schema: unknown,
      options?: { timeout?: number }
    ) => Promise<unknown>;
  };
};

export type ToolResultContent = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
};

export const SNOWFLAKE = z.string().regex(/^\d{17,20}$/, "must be a Discord snowflake");

export const queryValue = z.union([z.string(), z.number(), z.boolean()]);

export function textResult(text: string, opts?: { isError?: boolean }): ToolResultContent {
  return {
    content: [{ type: "text", text }],
    isError: opts?.isError === true ? true : undefined,
  };
}

export async function readActor(ctx: McpToolContext): Promise<{ actor: Actor; tier: Tier } | { error: string }> {
  const actor = ctx.authInfo?.extra?.actor;
  if (!actor) {
    return { error: "Missing actor headers; the MCP client did not forward Discord identity (X-Actor-Discord-*)." };
  }
  const tier = await resolveTier(actor);
  return { actor, tier };
}

export function tierGate(actual: Tier, required: Tier, action: string): ToolResultContent | null {
  if (meetsTier(actual, required)) return null;
  return textResult(
    `Insufficient tier for "${action}". This tool requires the ${required} role tier; the caller resolves to ${actual}.`,
    { isError: true }
  );
}

