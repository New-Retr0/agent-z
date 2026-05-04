import { getBaseUrl } from "./base-url";

export interface VerifyRequest {
  guildId: string;
  channelId: string;
  messageId: string;
  userId: string;
  emoji: string;
}

export type VerifyOutcome =
  | { kind: "granted"; roleId: string; messageDmStatus: "sent" | "skipped" | "failed" }
  | { kind: "already-verified"; roleId: string }
  | { kind: "config-incomplete"; reason: string }
  | { kind: "wrong-message"; expectedMessageId: string; actualMessageId: string }
  | { kind: "wrong-channel"; expectedChannelId: string; actualChannelId: string }
  | { kind: "wrong-emoji"; expectedEmoji: string; actualEmoji: string }
  | { kind: "error"; reason: string };

export async function invokeVerify(input: VerifyRequest): Promise<VerifyOutcome> {
  const secret = process.env.AGENT_Z_INTERNAL_SECRET?.trim();
  if (!secret) {
    return { kind: "error", reason: "missing AGENT_Z_INTERNAL_SECRET" };
  }
  const res = await fetch(`${getBaseUrl()}/api/discord/verify`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${secret}`,
    },
    body: JSON.stringify(input),
  });
  const text = await res.text();
  try {
    return JSON.parse(text) as VerifyOutcome;
  } catch {
    return { kind: "error", reason: `invalid response (HTTP ${res.status}): ${text}` };
  }
}
