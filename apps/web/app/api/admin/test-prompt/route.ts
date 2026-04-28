import { createGateway, generateText, stepCountIs } from "ai";
import { NextResponse } from "next/server";
import { assertAdmin } from "@/lib/require-admin";
import { getRuntimeConfig } from "@repo/config/runtime-config";
import { env } from "@repo/config/env";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const denied = await assertAdmin();
  if (denied) {
    return denied;
  }
  if (!env.AI_GATEWAY_API_KEY) {
    return NextResponse.json({ error: "AI_GATEWAY_API_KEY not set" }, { status: 503 });
  }
  const { prompt } = (await request.json()) as { prompt?: string };
  if (!prompt?.trim()) {
    return NextResponse.json({ error: "prompt required" }, { status: 400 });
  }
  const rc = await getRuntimeConfig();
  const model = createGateway({ apiKey: env.AI_GATEWAY_API_KEY })(rc.modelId);
  const result = await generateText({
    model,
    system: "You are a concise test assistant.",
    messages: [{ role: "user", content: prompt }],
    stopWhen: stepCountIs(5),
  });
  return NextResponse.json({
    text: result.text,
    usage: result.usage,
    modelId: rc.modelId,
  });
}
