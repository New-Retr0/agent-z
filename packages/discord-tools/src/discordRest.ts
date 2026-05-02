import type { DiscordToolConfig } from "./config.js";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type QueryValue = string | number | boolean;
export type QueryRecord = Record<string, QueryValue | QueryValue[] | undefined>;

export interface DiscordRequestResult {
  status: number;
  headers: Record<string, string>;
  body: unknown;
  rawBody: string;
}

const MAX_ATTEMPTS = 10;

function buildQueryString(query: QueryRecord | undefined): string {
  if (!query || Object.keys(query).length === 0) return "";
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const item of value) {
        params.append(key, String(item));
      }
    } else {
      params.append(key, String(value));
    }
  }
  const value = params.toString();
  return value ? `?${value}` : "";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function discordRequest(
  config: DiscordToolConfig,
  options: {
    method: HttpMethod;
    path: string;
    query?: QueryRecord;
    body?: unknown;
    auditReason?: string;
  }
): Promise<DiscordRequestResult> {
  const { method, path, query, body, auditReason } = options;
  if (!path.startsWith("/")) {
    throw new Error(`path must start with /, got: ${path}`);
  }

  const url = `${config.baseUrl}${path}${buildQueryString(query)}`;
  const baseHeaders: Record<string, string> = {
    Authorization: `Bot ${config.token}`,
    "User-Agent": config.userAgent,
  };

  const hasBody = body !== undefined && body !== null && method !== "GET" && method !== "DELETE";
  if (hasBody) {
    baseHeaders["Content-Type"] = "application/json";
  }
  if (auditReason?.trim()) {
    baseHeaders["X-Audit-Log-Reason"] = encodeURIComponent(auditReason.trim());
  }

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const response = await fetch(url, {
      method,
      headers: baseHeaders,
      body: hasBody ? JSON.stringify(body) : undefined,
    });
    const rawBody = await response.text();
    let parsed: unknown = rawBody;
    const contentType = response.headers.get("content-type") || "";
    if (rawBody.length && contentType.includes("application/json")) {
      try {
        parsed = JSON.parse(rawBody) as unknown;
      } catch {
        parsed = rawBody;
      }
    } else if (!rawBody.length) {
      parsed = null;
    }

    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headers[key] = value;
    });

    if (response.status === 429 && attempt < MAX_ATTEMPTS) {
      const retryAfter = response.headers.get("retry-after");
      const seconds = retryAfter ? parseFloat(retryAfter) : NaN;
      const ms = Number.isFinite(seconds) ? Math.ceil(seconds * 1000) : Math.min(1000 * 2 ** (attempt - 1), 30_000);
      await sleep(ms);
      continue;
    }

    return {
      status: response.status,
      headers,
      body: parsed,
      rawBody,
    };
  }

  throw new Error("discordRequest: exhausted retries");
}

export function formatDiscordResponse(result: DiscordRequestResult) {
  return JSON.stringify(
    {
      status: result.status,
      rateLimit: {
        limit: result.headers["x-ratelimit-limit"],
        remaining: result.headers["x-ratelimit-remaining"],
        reset: result.headers["x-ratelimit-reset"],
        scope: result.headers["x-ratelimit-scope"],
        bucket: result.headers["x-ratelimit-bucket"],
      },
      body: result.body,
    },
    null,
    2
  );
}
