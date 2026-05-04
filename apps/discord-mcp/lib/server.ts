import { createMcpHandler } from "mcp-handler";
import { registerMemoryTools } from "./memory-tools";
import { registerPrompts } from "./prompts";
import { registerResources } from "./resources";
import { registerTools } from "./tools";

/**
 * Compose tools, resources, and prompts on a single MCP server.
 *
 * basePath must match where the [transport] dynamic segment lives in the App Router. We host this at
 * `/api/[transport]/route.ts`, so basePath is `/api`. The public endpoints become `/api/mcp`
 * (Streamable HTTP, primary) and `/api/sse` (legacy fallback).
 *
 * `redisUrl` enables resumable SSE sessions via mcp-handler's optional Redis pub/sub layer. We can
 * leave it unset for now and rely on Streamable HTTP; flip on the Upstash integration in Phase 4 to
 * unlock the SSE path for clients that don't speak HTTP/2 streaming.
 */
export const mcpHandler = createMcpHandler(
  (server) => {
    registerTools(server);
    registerMemoryTools(server);
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
      // Required for `bulk_delete_messages` confirmation flow. Clients that don't support elicitation
      // can pass `preConfirmed: true` to bypass the prompt; see `lib/elicitation.ts`.
      elicitation: {},
    },
    instructions:
      "Tools, resources, and prompts for the Agent Z Discord moderation cockpit. Tools are tier-gated against the Discord role mapping in Postgres; resources require at least the verified tier unless explicitly marked public; destructive tools (bulk_delete_messages, role removals) ask for elicitation confirmation when impact is high.",
  },
  {
    basePath: "/api",
    maxDuration: 60,
    redisUrl: process.env.REDIS_URL,
    verboseLogs: process.env.NODE_ENV !== "production",
  }
);
