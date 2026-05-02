import type { AgentReplyTarget, AgentTier, DiscordInvocationContext } from "@repo/agent/types";

export function getBaseUrl(): string {
  const u = process.env.AGENT_Z_APP_BASE_URL?.trim();
  if (u) {
    return u.replace(/\/$/, "");
  }
  const v = process.env.VERCEL_URL?.trim();
  if (v) {
    return `https://${v.replace(/\/$/, "")}`;
  }
  return "http://localhost:3000";
}

/**
 * Triggers the Vercel workflow (`POST /api/workflow/invoke`) using `AGENT_Z_INTERNAL_SECRET`.
 */
export async function invokeAgentWorkflow(input: {
  prompt: string;
  invokerUserId: string;
  discordContext: DiscordInvocationContext;
  replyTarget?: AgentReplyTarget;
  requiredTier?: AgentTier;
  maxTier?: AgentTier;
}): Promise<{ runId: string; agentRunId: string; tier: AgentTier }> {
  const secret = process.env.AGENT_Z_INTERNAL_SECRET?.trim();
  if (!secret) {
    throw new Error("Missing AGENT_Z_INTERNAL_SECRET (must match apps/web).");
  }
  const res = await fetch(`${getBaseUrl()}/api/workflow/invoke`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${secret}`,
    },
    body: JSON.stringify({
      prompt: input.prompt,
      invokerUserId: input.invokerUserId,
      discordContext: input.discordContext,
      replyTarget: input.replyTarget,
      requiredTier: input.requiredTier,
      maxTier: input.maxTier,
    }),
  });
  if (!res.ok) {
    let message = `workflow invoke ${res.status}`;
    const text = await res.text();
    try {
      const body = JSON.parse(text) as { error?: string };
      if (body.error) {
        message = body.error;
      }
    } catch {
      if (text) {
        message = text;
      }
    }
    throw new Error(message);
  }
  return (await res.json()) as { runId: string; agentRunId: string; tier: AgentTier };
}
