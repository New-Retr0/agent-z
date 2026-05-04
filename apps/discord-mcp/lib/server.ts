import { createMcpHandler } from "mcp-handler";
import { registerMemoryTools } from "./memory-tools";
import { registerOversightTools } from "./oversight-tools";
import { registerPrompts } from "./prompts";
import { registerResources } from "./resources";
import { registerTools } from "./tools";

/**
 * Compose tools, resources, and prompts on a single MCP server.
 *
 * basePath must match where the App Router serves MCP. We use static routes `app/api/mcp` and
 * `app/api/sse`, so basePath stays `/api` and public URLs are `/api/mcp` (Streamable HTTP) and
 * `/api/sse` (legacy). **Do not** use a dynamic `/api/[transport]` for `mcp`/`sse` — that also
 * matched `/api/discord` and broke Discord's Interactions (MCP auth returned `invalid_token`).
 *
 * `redisUrl` enables resumable SSE sessions via mcp-handler's optional Redis pub/sub layer. We can
 * leave it unset for now and rely on Streamable HTTP; flip on the Upstash integration in Phase 4 to
 * unlock the SSE path for clients that don't speak HTTP/2 streaming.
 */
export const mcpHandler = createMcpHandler(
  (server) => {
    registerTools(server);
    registerMemoryTools(server);
    registerOversightTools(server);
    registerResources(server);
    registerPrompts(server);
  },
  {
    serverInfo: {
      name: "agent-z-discord-mcp",
      version: "0.1.0",
    },
    capabilities: {
      tools: { listChanged: true },
      resources: { listChanged: true, subscribe: false },
      prompts: { listChanged: true },
      // Declares elicitation for destructive confirmations (`lib/elicitation.ts`). mcp-handler types match SDK experimental bucket.
      experimental: {
        elicitation: {},
      },
    },
    instructions:
      "Agent Z Discord MCP: tools are tier-gated (Discord role mapping in Postgres). **Read** tier: discord_api_read, member lookup, pinned messages, emoji/automod lists, audit log snapshots, webhook listing. **Mod (write-direct)**: send/edit/delete messages, reactions, pins, threads, crosspost. **Admin (write-staged)**: kick/ban, channel/category CRUD, role CRUD & assignment, bulk delete, AutoMod/rule edits, emoji upload, webhook create/delete — these stage a PendingAction unless the MCP client sends interaction headers matching Discord's confirm flow. Resources and prompts follow the same tier rules; use bearer auth plus X-Actor-Discord-* headers.",
  },
  {
    basePath: "/api",
    maxDuration: 60,
    redisUrl: process.env.REDIS_URL,
    verboseLogs: process.env.NODE_ENV !== "production",
  }
);
