/**
 * Server-side introspection helpers for the discord-mcp deployment. Used by
 * /admin/mcp to render a live snapshot of registered tools, resources, and
 * prompts without depending on a stale documentation file.
 *
 * Talks to the streamable-HTTP MCP transport directly with the AGENT_Z_MCP_TOKEN
 * service-account token (operator tier). All requests are JSON-RPC 2.0; we
 * parse the SSE stream the server uses for replies and pluck the first event.
 */

export interface McpToolSummary {
  name: string;
  title?: string;
  description?: string;
  annotations?: Record<string, unknown>;
}

export interface McpResourceSummary {
  uri: string;
  name?: string;
  description?: string;
  mimeType?: string;
}

export interface McpResourceTemplateSummary {
  uriTemplate: string;
  name?: string;
  description?: string;
}

export interface McpPromptSummary {
  name: string;
  title?: string;
  description?: string;
  arguments?: Array<{ name: string; description?: string; required?: boolean }>;
}

export interface McpSnapshot {
  endpoint: string;
  available: boolean;
  error?: string;
  serverInfo?: { name: string; version: string };
  tools: McpToolSummary[];
  resources: McpResourceSummary[];
  resourceTemplates: McpResourceTemplateSummary[];
  prompts: McpPromptSummary[];
}

const PROTOCOL_VERSION = "2025-06-18";

function getMcpEndpoint(): string {
  // Same effective endpoint the in-app agent uses (DISCORD_MCP_URL), then admin-only overrides.
  const explicit = process.env.MCP_ENDPOINT_URL?.trim();
  if (explicit) return explicit;
  const discordMcp = process.env.DISCORD_MCP_URL?.trim();
  if (discordMcp) {
    // Match apps/web `runAgentZ` — full streamable-HTTP URL, typically …/api/mcp
    return discordMcp.replace(/\/$/, "");
  }
  const base = process.env.MCP_BASE_URL?.trim();
  if (!base) return "";
  return base.replace(/\/$/, "") + "/api/mcp";
}

function getMcpToken(): string {
  return (process.env.AGENT_Z_MCP_TOKEN ?? process.env.DISCORD_MCP_API_KEY ?? "").trim();
}

interface JsonRpcResponse<T> {
  jsonrpc: "2.0";
  id: number;
  result?: T;
  error?: { code: number; message: string };
}

/**
 * The streamable-HTTP transport responds with `text/event-stream` for non-empty
 * replies. We parse the first `data: {...}` line into JSON.
 */
async function rpc<T>(
  endpoint: string,
  token: string,
  sessionId: string | undefined,
  method: string,
  params: Record<string, unknown> | undefined,
  id: number,
  init?: { capture: "session-id" }
): Promise<{ result: T | undefined; sessionId: string | null; error?: string }> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json, text/event-stream",
    "Content-Type": "application/json",
    "MCP-Protocol-Version": PROTOCOL_VERSION,
  };
  if (sessionId) headers["Mcp-Session-Id"] = sessionId;

  const res = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
    cache: "no-store",
  });
  const newSessionId =
    init?.capture === "session-id" ? res.headers.get("mcp-session-id") : sessionId ?? null;
  if (!res.ok) {
    return { result: undefined, sessionId: newSessionId, error: `HTTP ${res.status}` };
  }
  const text = await res.text();
  const match = text.match(/data: (.*)$/m);
  const body = match ? match[1] : text;
  try {
    const parsed = JSON.parse(body) as JsonRpcResponse<T>;
    if (parsed.error) {
      return { result: undefined, sessionId: newSessionId, error: parsed.error.message };
    }
    return { result: parsed.result, sessionId: newSessionId };
  } catch (e) {
    return {
      result: undefined,
      sessionId: newSessionId,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

interface InitializeResult {
  serverInfo: { name: string; version: string };
}
interface ListToolsResult {
  tools: McpToolSummary[];
}
interface ListResourcesResult {
  resources: McpResourceSummary[];
}
interface ListResourceTemplatesResult {
  resourceTemplates: McpResourceTemplateSummary[];
}
interface ListPromptsResult {
  prompts: McpPromptSummary[];
}

/** Non-secret diagnostics for the MCP admin page (which env knobs are present). */
export function getMcpEnvPresence(): {
  discordMcpUrl: boolean;
  mcpBaseUrl: boolean;
  mcpEndpointUrl: boolean;
  mcpApiKey: boolean;
  agentZMcpToken: boolean;
} {
  return {
    discordMcpUrl: Boolean(process.env.DISCORD_MCP_URL?.trim()),
    mcpBaseUrl: Boolean(process.env.MCP_BASE_URL?.trim()),
    mcpEndpointUrl: Boolean(process.env.MCP_ENDPOINT_URL?.trim()),
    mcpApiKey: Boolean(process.env.DISCORD_MCP_API_KEY?.trim()),
    agentZMcpToken: Boolean(process.env.AGENT_Z_MCP_TOKEN?.trim()),
  };
}

export async function introspectMcp(): Promise<McpSnapshot> {
  const endpoint = getMcpEndpoint();
  const token = getMcpToken();
  const empty: McpSnapshot = {
    endpoint,
    available: false,
    tools: [],
    resources: [],
    resourceTemplates: [],
    prompts: [],
  };
  if (!endpoint) {
    return {
      ...empty,
      error:
        "MCP endpoint not configured — set DISCORD_MCP_URL (recommended) or MCP_BASE_URL / MCP_ENDPOINT_URL on this app.",
    };
  }
  if (!token) {
    return {
      ...empty,
      error:
        "MCP auth not configured — set DISCORD_MCP_API_KEY (or AGENT_Z_MCP_TOKEN) to match MCP_API_KEY on discord-mcp.",
    };
  }

  // Initialize.
  const init = await rpc<InitializeResult>(
    endpoint,
    token,
    undefined,
    "initialize",
    {
      protocolVersion: PROTOCOL_VERSION,
      clientInfo: { name: "agent-z-admin", version: "1.0.0" },
      capabilities: { tools: {}, resources: {}, prompts: {} },
    },
    1,
    { capture: "session-id" }
  );
  if (init.error || !init.result) {
    return { ...empty, error: `initialize failed: ${init.error ?? "no result"}` };
  }
  const sessionId = init.sessionId ?? undefined;

  // Required `notifications/initialized` ping (one-way; ignore any error).
  try {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      Accept: "application/json, text/event-stream",
      "Content-Type": "application/json",
      "MCP-Protocol-Version": PROTOCOL_VERSION,
    };
    if (sessionId) headers["Mcp-Session-Id"] = sessionId;
    await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
      cache: "no-store",
    });
  } catch {
    // notifications are best-effort
  }

  const [toolsRes, resourcesRes, templatesRes, promptsRes] = await Promise.all([
    rpc<ListToolsResult>(endpoint, token, sessionId, "tools/list", {}, 2),
    rpc<ListResourcesResult>(endpoint, token, sessionId, "resources/list", {}, 3),
    rpc<ListResourceTemplatesResult>(
      endpoint,
      token,
      sessionId,
      "resources/templates/list",
      {},
      4
    ),
    rpc<ListPromptsResult>(endpoint, token, sessionId, "prompts/list", {}, 5),
  ]);

  return {
    endpoint,
    available: true,
    serverInfo: init.result.serverInfo,
    tools: toolsRes.result?.tools ?? [],
    resources: resourcesRes.result?.resources ?? [],
    resourceTemplates: templatesRes.result?.resourceTemplates ?? [],
    prompts: promptsRes.result?.prompts ?? [],
  };
}
