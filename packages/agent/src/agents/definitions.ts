import { createGateway, generateText, stepCountIs } from "ai";
import { getRuntimeConfig } from "@repo/config/runtime-config";
import { env } from "@repo/config/env";
import type { AgentTier } from "../types.js";

export type { AgentTier } from "../types.js";
export { getToolsForTier } from "../tier-tools.js";

/**
 * Resolves the gateway model for the current `model_id` in Postgres.
 */
export async function getGatewayModel() {
  if (!env.AI_GATEWAY_API_KEY) {
    throw new Error("AI_GATEWAY_API_KEY missing — run `vercel env pull` (OIDC) or set manually.");
  }
  const rc = await getRuntimeConfig();
  return createGateway({ apiKey: env.AI_GATEWAY_API_KEY })(rc.modelId);
}

/**
 * One-shot text generation for surfaces that do not use ToolLoopAgent.
 * Multi-step tool calling lives in runAgentZ (apps/web).
 */
export async function generateAgentReply(input: { tier: AgentTier; prompt: string; system: string }) {
  const model = await getGatewayModel();
  return generateText({
    model,
    system: input.system,
    messages: [{ role: "user", content: input.prompt }],
    stopWhen: stepCountIs(20),
  });
}

export const adminAgent = { id: "agent-z-admin" as const };
export const modAgent = { id: "agent-z-mod" as const };
export const verifiedAgent = { id: "agent-z-verified" as const };

export function getAgentForTier(tier: AgentTier) {
  if (tier === "admin") return adminAgent;
  if (tier === "mod") return modAgent;
  return verifiedAgent;
}
