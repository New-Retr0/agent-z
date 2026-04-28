import { unstable_cache, updateTag } from "next/cache";
import { prisma } from "@repo/db";

export const RUNTIME_CONFIG_TAG = "runtime-config" as const;

export type RuntimeConfig = {
  modelId: string;
  systemPromptOverride: string | null;
  publicTierEnabled: boolean;
  messageContentIntent: boolean;
  allowDeleteVerifiedRole: boolean;
  welcomeDmTemplate: string;
};

const DEFAULTS: RuntimeConfig = {
  modelId: "openai/gpt-4.1",
  systemPromptOverride: null,
  publicTierEnabled: false,
  messageContentIntent: true,
  allowDeleteVerifiedRole: false,
  welcomeDmTemplate: "Welcome to the server! You now have the Verified role.",
};

async function loadFromDbInternal(): Promise<RuntimeConfig> {
  if (!process.env.DATABASE_URL) {
    return DEFAULTS;
  }
  const keys = [
    "model_id",
    "system_prompt_override",
    "public_tier_enabled",
    "message_content_intent",
    "allow_delete_verified_role",
    "welcome_dm_template",
  ] as const;

  let rows: { key: string; valueJson: string }[];
  try {
    rows = await prisma.botConfig.findMany({
      where: { key: { in: [...keys] } },
    });
  } catch {
    return DEFAULTS;
  }
  const map = new Map(rows.map((r) => [r.key, r.valueJson]));

  const getBool = (k: string) => {
    const v = map.get(k);
    if (v === undefined) return undefined;
    return v === "true" || v === "1";
  };
  const getStr = (k: string) => {
    const v = map.get(k);
    if (v === undefined) return undefined;
    try {
      return JSON.parse(v) as string;
    } catch {
      return v;
    }
  };

  return {
    modelId: getStr("model_id") ?? DEFAULTS.modelId,
    systemPromptOverride: getStr("system_prompt_override") ?? null,
    publicTierEnabled: getBool("public_tier_enabled") ?? DEFAULTS.publicTierEnabled,
    messageContentIntent: getBool("message_content_intent") ?? DEFAULTS.messageContentIntent,
    allowDeleteVerifiedRole: getBool("allow_delete_verified_role") ?? DEFAULTS.allowDeleteVerifiedRole,
    welcomeDmTemplate: getStr("welcome_dm_template") ?? DEFAULTS.welcomeDmTemplate,
  };
}

/**
 * Cached per Next.js data cache; invalidate after admin updates via `invalidateRuntimeConfig()`.
 */
export const getRuntimeConfig = unstable_cache(
  async () => loadFromDbInternal(),
  ["runtime-config-v1"],
  { tags: [RUNTIME_CONFIG_TAG] }
);

export function invalidateRuntimeConfig() {
  updateTag(RUNTIME_CONFIG_TAG);
}
