import { createGateway } from "ai";
import { getRuntimeConfig } from "@repo/config/runtime-config";
import { env } from "@repo/config/env";
import { ModelsClient } from "./ui";

export const dynamic = "force-dynamic";

type Providers = Record<string, { id: string; name: string }[]>;

export default async function ModelsPage() {
  const [rc, initialProviders] = await Promise.all([getRuntimeConfig(), getInitialProviders()]);
  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <h1 className="text-2xl font-semibold">Models</h1>
      <p className="text-sm text-zinc-500">
        Current model: <span className="font-mono text-zinc-300">{rc.modelId}</span>
      </p>
      <ModelsClient currentModelId={rc.modelId} initialProviders={initialProviders} />
    </div>
  );
}

async function getInitialProviders(): Promise<Providers> {
  if (!env.AI_GATEWAY_API_KEY) {
    return {};
  }
  try {
    const gateway = createGateway({ apiKey: env.AI_GATEWAY_API_KEY });
    const { models } = await gateway.getAvailableModels();
    const byProvider: Providers = {};
    for (const model of models) {
      const provider = model.specification?.provider ?? "unknown";
      byProvider[provider] ??= [];
      byProvider[provider].push({ id: model.id, name: model.name });
    }
    return byProvider;
  } catch {
    return {};
  }
}
