import { createGateway } from "ai";
import { unstable_cache } from "next/cache";
import { env } from "@repo/config/env";
import { getRuntimeConfig } from "@repo/config/runtime-config";
import { countPendingActionsByStatus, getOversightStats, listPendingActionsForAdmin } from "@repo/db";
import { introspectMcp } from "@/lib/mcp-introspect";

export type ObservabilitySnapshot = {
  modelId: string;
  mcpTools: number;
  mcpDiscordTools: number;
  mcpAvailable: boolean;
  mcpError?: string;
  pendingActionCounts?: Partial<
    Record<"pending" | "executed" | "cancelled" | "expired" | "failed", number>
  >;
  oversight: {
    total: number;
    embedded: number;
    pendingEmbed: number;
    oldestPendingAt: string | null;
  } | null;
  gatewayCatalogCount: number | null;
  pendingActions: Awaited<ReturnType<typeof listPendingActionsForAdmin>>;
  fetchedAt: string;
};

export const getObservabilitySnapshot = unstable_cache(
  async (): Promise<ObservabilitySnapshot> => {
    const rc = await getRuntimeConfig();
    const [mcp, oversight, pending, pendingCounts] = await Promise.all([
      introspectMcp(),
      getOversightStats().catch(() => null),
      listPendingActionsForAdmin({ limit: 50 }),
      countPendingActionsByStatus().catch(() => ({})),
    ]);
    let gatewayCatalogCount: number | null = null;
    if (env.AI_GATEWAY_API_KEY) {
      try {
        const gateway = createGateway({ apiKey: env.AI_GATEWAY_API_KEY });
        const { models } = await gateway.getAvailableModels();
        gatewayCatalogCount = models.length;
      } catch {
        gatewayCatalogCount = null;
      }
    }
    const discordTools = mcp.available ? mcp.tools.filter((t) => t.name.startsWith("discord_")) : [];
    return {
      modelId: rc.modelId,
      mcpTools: mcp.available ? mcp.tools.length : 0,
      mcpDiscordTools: discordTools.length,
      mcpAvailable: mcp.available,
      mcpError: mcp.error,
      oversight: oversight
        ? {
            total: oversight.total,
            embedded: oversight.embedded,
            pendingEmbed: oversight.pending,
            oldestPendingAt: oversight.oldestPending?.toISOString() ?? null,
          }
        : null,
      pendingActionCounts: pendingCounts,
      gatewayCatalogCount,
      pendingActions: pending,
      fetchedAt: new Date().toISOString(),
    };
  },
  ["admin-observability-v1"],
  { revalidate: 60, tags: ["observability"] }
);
