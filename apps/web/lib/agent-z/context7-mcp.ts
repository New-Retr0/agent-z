/**
 * Context7 MCP client — second MCP transport that gives Agent Z grounded
 * Vercel / Next.js / library documentation lookup.
 *
 * Context7 (https://context7.com) hosts a remote MCP server with two tools:
 *   - `resolve-library-id`  → maps a fuzzy name to a canonical library id
 *   - `get-library-docs`     → fetches versioned docs for a library id
 *
 * Wiring it as a second MCP client (in addition to apps/discord-mcp) lets the
 * agent fan out to the right surface for each request: Discord tools for
 * server actions, Context7 tools for "how do I do X in Next.js" answers. The
 * AI SDK simply merges both tool sets onto a single ToolLoopAgent, so the
 * model picks whichever it needs without us having to route manually.
 *
 * Configuration:
 *   - CONTEXT7_MCP_URL (default https://mcp.context7.com/mcp)
 *   - CONTEXT7_API_KEY (optional; required for higher rate limits)
 *
 * Failure mode: if the URL is missing or the connection fails, we return null
 * and the agent runs with only the Discord tool set. Vercel-doc grounding
 * becomes a soft enhancement, never a hard dependency.
 */

import { createMCPClient } from "@ai-sdk/mcp";

export const CONTEXT7_DEFAULT_URL = "https://mcp.context7.com/mcp";

type Context7Client = Awaited<ReturnType<typeof createMCPClient>>;

export type Context7Connection = {
  client: Context7Client;
  /** True if Context7 is using a real API key. False = anonymous, lower rate limits. */
  authenticated: boolean;
  url: string;
};

export function isContext7Configured(): boolean {
  // Even without an explicit URL, Context7 has a default public endpoint, so
  // the integration is considered configured as long as the feature flag isn't
  // disabled. The flag flips on once an admin opts in.
  const enabled = ["1", "true", "yes", "on"].includes(
    (process.env.AGENT_Z_CONTEXT7_ENABLED ?? "").trim().toLowerCase()
  );
  return enabled;
}

export function getContext7Url(): string {
  return process.env.CONTEXT7_MCP_URL?.trim() || CONTEXT7_DEFAULT_URL;
}

/**
 * Open a Context7 MCP client. Returns null if the integration is disabled or
 * the connection fails (callers should treat null as "no extra tools").
 */
export async function openContext7Client(): Promise<Context7Connection | null> {
  if (!isContext7Configured()) {
    return null;
  }
  const url = getContext7Url();
  const apiKey = process.env.CONTEXT7_API_KEY?.trim();
  const headers: Record<string, string> = {
    "User-Agent": "agent-z/1.0 (+https://github.com/New-Retr0/agent-z)",
  };
  if (apiKey) {
    headers["CONTEXT7_API_KEY"] = apiKey;
  }

  try {
    const client = await createMCPClient({
      transport: { type: "http", url, headers },
    });
    return { client, authenticated: Boolean(apiKey), url };
  } catch (error) {
    console.error("[agent-z] Failed to open Context7 MCP client:", error);
    return null;
  }
}

/**
 * Best-effort close. Swallows errors so cleanup never throws after a
 * successful generate().
 */
export async function closeContext7Client(connection: Context7Connection | null): Promise<void> {
  if (!connection) return;
  try {
    await connection.client.close();
  } catch {
    // ignore
  }
}
