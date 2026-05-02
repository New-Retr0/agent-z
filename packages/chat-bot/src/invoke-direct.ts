import type { AgentReplyTarget, DiscordInvocationContext } from "@repo/agent/types";
import { getBaseUrl } from "./invoke-workflow";

export async function invokeAgentDirect(input: {
  prompt: string;
  invokerUserId: string;
  discordContext: DiscordInvocationContext;
  replyTarget: AgentReplyTarget;
}): Promise<{ delivered: boolean; kind: string }> {
  const secret = process.env.AGENT_Z_INTERNAL_SECRET?.trim();
  if (!secret) {
    throw new Error("Missing AGENT_Z_INTERNAL_SECRET (must match apps/web).");
  }
  const res = await fetch(`${getBaseUrl()}/api/agent/direct`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${secret}`,
    },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    let message = `direct agent invoke ${res.status}`;
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
  return (await res.json()) as { delivered: boolean; kind: string };
}
