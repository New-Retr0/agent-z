import { createGateway } from "ai";
import { unstable_cache } from "next/cache";
import { NextResponse } from "next/server";
import { assertAdmin } from "@/lib/require-admin";
import { env } from "@repo/config/env";

export const runtime = "nodejs";

const getCachedGatewayModelsPayload = unstable_cache(
  async () => {
    const gateway = createGateway({ apiKey: env.AI_GATEWAY_API_KEY! });
    const { models } = await gateway.getAvailableModels();
    const byProvider: Record<string, { id: string; name: string }[]> = {};
    for (const m of models) {
      const spec = m.specification;
      const provider = spec?.provider ?? "unknown";
      if (!byProvider[provider]) {
        byProvider[provider] = [];
      }
      byProvider[provider].push({ id: m.id, name: m.name });
    }
    return { models, byProvider, fetchedAt: new Date().toISOString() };
  },
  ["admin-ai-gateway-models"],
  { revalidate: 300, tags: ["ai-gateway-models"] }
);

export async function GET() {
  const denied = await assertAdmin();
  if (denied) {
    return denied;
  }
  if (!env.AI_GATEWAY_API_KEY) {
    return NextResponse.json({ error: "AI_GATEWAY_API_KEY not set" }, { status: 503 });
  }
  const payload = await getCachedGatewayModelsPayload();
  return NextResponse.json(payload);
}