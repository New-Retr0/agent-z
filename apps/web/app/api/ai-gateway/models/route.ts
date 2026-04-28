import { createGateway } from "ai";
import { NextResponse } from "next/server";
import { assertAdmin } from "@/lib/require-admin";
import { env } from "@repo/config/env";

const cache: { at: number; data: unknown } = { at: 0, data: null };
const FIVE_MIN = 5 * 60 * 1000;

export const runtime = "nodejs";

export async function GET() {
  const denied = await assertAdmin();
  if (denied) {
    return denied;
  }
  if (!env.AI_GATEWAY_API_KEY) {
    return NextResponse.json({ error: "AI_GATEWAY_API_KEY not set" }, { status: 503 });
  }
  const now = Date.now();
  if (cache.data && now - cache.at < FIVE_MIN) {
    return NextResponse.json(cache.data);
  }
  const gateway = createGateway({ apiKey: env.AI_GATEWAY_API_KEY });
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
  const payload = { models, byProvider, fetchedAt: new Date().toISOString() };
  cache.data = payload;
  cache.at = now;
  return NextResponse.json(payload);
}
