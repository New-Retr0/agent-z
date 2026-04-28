import { createHash, timingSafeEqual } from "node:crypto";
import type { AgentReplyTarget, AgentTier, DiscordInvocationContext } from "@repo/agent/types";

const AGENT_TIERS = new Set<AgentTier>(["admin", "mod", "verified", "public"]);
const MAX_PROMPT_LENGTH = 8_000;
const MAX_SYSTEM_LENGTH = 12_000;

type JsonRecord = Record<string, unknown>;

export function timingSafeSecretEqual(actual: string | null | undefined, expected: string | null | undefined) {
  if (!actual || !expected) {
    return false;
  }
  const actualHash = createHash("sha256").update(actual).digest();
  const expectedHash = createHash("sha256").update(expected).digest();
  return timingSafeEqual(actualHash, expectedHash);
}

export async function readJsonRecord(request: Request): Promise<JsonRecord | null> {
  try {
    const body = await request.json();
    return isRecord(body) ? body : null;
  } catch {
    return null;
  }
}

export function parsePrompt(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const prompt = value.trim();
  if (!prompt || prompt.length > MAX_PROMPT_LENGTH) {
    return null;
  }
  return prompt;
}

export function parseSystemPrompt(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const system = value.trim();
  if (!system || system.length > MAX_SYSTEM_LENGTH) {
    return undefined;
  }
  return system;
}

export function parseAgentTier(value: unknown, fallback: AgentTier): AgentTier | null {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  return typeof value === "string" && AGENT_TIERS.has(value as AgentTier) ? (value as AgentTier) : null;
}

export function parseReplyTarget(value: unknown): AgentReplyTarget | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const adapterName = stringProp(value, "adapterName");
  const id = stringProp(value, "id");
  const isDM = booleanProp(value, "isDM");
  const channelVisibility = optionalStringProp(value, "channelVisibility");
  if (!adapterName || !id || isDM === undefined) {
    return undefined;
  }
  if (value._type === "chat:Channel") {
    return { _type: "chat:Channel", adapterName, id, isDM, channelVisibility };
  }
  if (value._type === "chat:Thread") {
    const channelId = stringProp(value, "channelId");
    if (!channelId) {
      return undefined;
    }
    return {
      _type: "chat:Thread",
      adapterName,
      id,
      isDM,
      channelVisibility,
      channelId,
      currentMessage: value.currentMessage,
    };
  }
  return undefined;
}

export function parseDiscordContext(value: unknown): DiscordInvocationContext | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const roleIds = arrayOfStrings(value.roleIds);
  return {
    guildId: optionalStringProp(value, "guildId"),
    channelId: optionalStringProp(value, "channelId"),
    roleIds,
    isDirectMessage: booleanProp(value, "isDirectMessage"),
  };
}

export function stringProp(record: JsonRecord, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function optionalStringProp(record: JsonRecord, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" ? value.trim() || undefined : undefined;
}

function booleanProp(record: JsonRecord, key: string): boolean | undefined {
  return typeof record[key] === "boolean" ? record[key] : undefined;
}

function arrayOfStrings(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => item.trim());
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
