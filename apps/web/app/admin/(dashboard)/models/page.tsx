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
      <div>
        <h1 className="text-2xl font-semibold">Models</h1>
        <p className="text-sm text-zinc-500 mt-1">
          The active model is stored in the database and used for Agent Z runs. Pick a gateway model below and save —
          no rebuild required. If the dropdown only shows the current model id, confirm{" "}
          <code className="font-mono text-zinc-400">AI_GATEWAY_API_KEY</code> is set on this app so the catalog can load.
        </p>
      </div>
      <p className="text-sm text-zinc-500 -mt-2">
        Current: <span className="font-mono text-zinc-300">{rc.modelId}</span>
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
