const SNOW = /^\d{17,20}$/;

function parseIds(raw: string | undefined, name: string): Set<string> {
  if (!raw?.trim()) {
    return new Set();
  }
  const ids = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const id of ids) {
    if (!SNOW.test(id)) {
      throw new Error(`${name}: invalid snowflake "${id}"`);
    }
  }
  return new Set(ids);
}

function parseRequiredIds(raw: string | undefined, name: string): Set<string> {
  const s = parseIds(raw, name);
  if (s.size === 0) {
    throw new Error(`${name} is required (comma-separated snowflake ids).`);
  }
  return s;
}

function flagEnabled(raw: string | undefined, defaultOn = true): boolean {
  if (raw == null || raw === "") return defaultOn;
  return !["0", "false", "no", "off"].includes(String(raw).trim().toLowerCase());
}

function resolveGuildIdFromEnv(): string {
  const explicit =
    process.env.REACTION_GUILD_ID?.trim() ?? process.env.DISCORD_GUILD_ID?.trim();
  if (explicit) return explicit;
  const fromAllowlist = (process.env.DISCORD_ALLOWED_GUILD_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (fromAllowlist.length === 1) {
    return fromAllowlist[0]!;
  }
  throw new Error(
    "Set REACTION_GUILD_ID (or DISCORD_GUILD_ID), or put exactly one id in DISCORD_ALLOWED_GUILD_IDS."
  );
}

function parseAllowlist(
  envVal: string | undefined
): Set<string> | null {
  if (!envVal?.trim()) return null;
  return parseIds(envVal, "DISCORD_ALLOWED_GUILD_IDS");
}

export interface AgentZConfig {
  discordToken: string;
  userAgent: string;
  /** Primary guild (reaction + agent). */
  guildId: string;
  /** Allowlist for REST paths, or null = no restriction. */
  allowedGuildIds: Set<string> | null;
  apiBaseUrl: string;
  reactionVerifiedRoleId: string | null;
  mcpAllowDeleteVerifiedRole: boolean;
  knowledgeDir: string;
  aiGatewayApiKey: string;
  modelId: string;
  privilegedChannelIds: Set<string>;
  adminRoleIds: Set<string>;
  moderatorRoleIds: Set<string>;
  invokeRoleId: string | null;
  publicTierEnabled: boolean;
  protectedOwnerUserId: string;
  promptOverridePath: string | null;
  userRpm: number;
  userDaily: number;
  globalRpm: number;
  globalDaily: number;
  ratelimitBypassUserIds: Set<string>;
}

import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

const defaultKnowledgeDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "knowledge"
);

type ConfigCache = { isFull: true; cfg: AgentZConfig } | { isFull: false; cfg: AgentZConfig } | null;
let configCache: ConfigCache = null;

/**
 * Build config from env. If `requireAiGateway` is false, missing `AI_GATEWAY_API_KEY` becomes
 * empty string (help/roles only — do not call the LLM with that).
 */
function buildAgentZConfigFromEnv(requireAiGateway: boolean): AgentZConfig {
  const token = process.env.DISCORD_BOT_TOKEN?.trim();
  if (!token) {
    throw new Error("DISCORD_BOT_TOKEN is required.");
  }

  const apiVersion = process.env.DISCORD_API_VERSION?.trim() || "10";
  if (!/^\d+$/.test(apiVersion)) {
    throw new Error("DISCORD_API_VERSION must be numeric (e.g. 10).");
  }

  const aiKey = process.env.AI_GATEWAY_API_KEY?.trim() ?? "";
  if (requireAiGateway && !aiKey) {
    throw new Error("AI_GATEWAY_API_KEY is required for Agent Z prompts and tools that call the model.");
  }

  const guildId = resolveGuildIdFromEnv();
  let allowedGuildIds: Set<string> | null;
  try {
    allowedGuildIds = parseAllowlist(process.env.DISCORD_ALLOWED_GUILD_IDS);
  } catch (e) {
    throw new Error(e instanceof Error ? e.message : String(e));
  }
  if (!allowedGuildIds?.size) {
    allowedGuildIds = new Set([guildId]);
  }

  const knowledgeDir = process.env.AGENT_Z_KNOWLEDGE_DIR?.trim() || defaultKnowledgeDir;

  if (!existsSync(knowledgeDir)) {
    // sync script will create; for tests allow missing until sync runs
  }

  const modelId = process.env.AGENT_Z_MODEL_ID?.trim() || "anthropic/claude-haiku-4.5";

  const reactionVerified = process.env.REACTION_VERIFIED_ROLE_ID?.trim() || null;
  const mcpAllowDelete = ["1", "true", "yes"].includes(
    (process.env.MCP_ALLOW_DELETE_VERIFIED_ROLE ?? "").trim().toLowerCase()
  );

  const protectedOwner = process.env.AGENT_Z_OWNER_USER_ID?.trim();
  if (!protectedOwner) {
    throw new Error("AGENT_Z_OWNER_USER_ID is required.");
  }
  if (!SNOW.test(protectedOwner)) {
    throw new Error("AGENT_Z_OWNER_USER_ID must be a valid snowflake.");
  }

  const invoke = process.env.AGENT_Z_INVOKE_ROLE_ID?.trim();
  if (invoke && !SNOW.test(invoke)) {
    throw new Error("AGENT_Z_INVOKE_ROLE_ID must be a valid snowflake.");
  }

  return {
    discordToken: token,
    userAgent: "DiscordBot (https://github.com/vercel/discord-mcp, 1.0.0) AgentZ",
    guildId,
    allowedGuildIds,
    apiBaseUrl: `https://discord.com/api/v${apiVersion}`,
    reactionVerifiedRoleId: reactionVerified,
    mcpAllowDeleteVerifiedRole: mcpAllowDelete,
    knowledgeDir,
    aiGatewayApiKey: aiKey,
    modelId,
    privilegedChannelIds: parseRequiredIds(
      process.env.AGENT_Z_PRIVILEGED_CHANNEL_IDS,
      "AGENT_Z_PRIVILEGED_CHANNEL_IDS"
    ),
    adminRoleIds: parseRequiredIds(
      process.env.AGENT_Z_ADMIN_ROLE_IDS,
      "AGENT_Z_ADMIN_ROLE_IDS"
    ),
    moderatorRoleIds: parseRequiredIds(
      process.env.AGENT_Z_MODERATOR_ROLE_IDS,
      "AGENT_Z_MODERATOR_ROLE_IDS"
    ),
    invokeRoleId: invoke && invoke.length > 0 ? invoke : null,
    publicTierEnabled: flagEnabled(process.env.AGENT_Z_PUBLIC_TIER_ENABLED, true),
    protectedOwnerUserId: protectedOwner,
    promptOverridePath: process.env.AGENT_Z_PROMPT_OVERRIDE_PATH?.trim() || null,
    userRpm: Number.parseInt(process.env.AGENT_Z_USER_RPM ?? "5", 10) || 5,
    userDaily: Number.parseInt(process.env.AGENT_Z_USER_DAILY ?? "50", 10) || 50,
    globalRpm: Number.parseInt(process.env.AGENT_Z_GLOBAL_RPM ?? "30", 10) || 30,
    globalDaily: Number.parseInt(process.env.AGENT_Z_GLOBAL_DAILY ?? "500", 10) || 500,
    ratelimitBypassUserIds: parseIds(
      process.env.AGENT_Z_RATELIMIT_BYPASS_USER_IDS,
      "AGENT_Z_RATELIMIT_BYPASS_USER_IDS"
    ),
  };
}

/**
 * Full Agent Z configuration (LLM + tools). Fails if `AI_GATEWAY_API_KEY` is missing.
 */
export function loadAgentZConfig(): AgentZConfig {
  const c = buildAgentZConfigFromEnv(true);
  configCache = { isFull: true, cfg: c };
  return c;
}

/**
 * Config for help books, invoke gate, and tiers — works without `AI_GATEWAY_API_KEY`.
 * If the full config was already loaded, reuses it.
 */
export function loadAgentZConfigForHelp(): AgentZConfig {
  if (configCache) {
    return configCache.cfg;
  }
  try {
    return loadAgentZConfig();
  } catch {
    const c = buildAgentZConfigFromEnv(false);
    configCache = { isFull: false, cfg: c };
    return c;
  }
}

export function getApplicationIdForRegister(): string {
  const id =
    process.env.DISCORD_APPLICATION_ID?.trim() ?? process.env.DISCORD_CLIENT_ID?.trim() ?? "";
  if (!id) {
    throw new Error("DISCORD_APPLICATION_ID (or DISCORD_CLIENT_ID) is required to register slash commands.");
  }
  return id;
}

export function isModeratorMember(roleIds: ReadonlySet<string> | string[], cfg: AgentZConfig): boolean {
  const s = roleIds instanceof Set ? roleIds : new Set(roleIds);
  for (const id of cfg.moderatorRoleIds) {
    if (s.has(id)) return true;
  }
  for (const id of cfg.adminRoleIds) {
    if (s.has(id)) return true;
  }
  return false;
}

export function isAdminMember(roleIds: ReadonlySet<string> | string[], cfg: AgentZConfig): boolean {
  const s = roleIds instanceof Set ? roleIds : new Set(roleIds);
  for (const id of cfg.adminRoleIds) {
    if (s.has(id)) return true;
  }
  return false;
}
