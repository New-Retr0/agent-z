import type { AppConfig } from "./config.js";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type QueryValue = string | number | boolean;
export type QueryRecord = Record<
  string,
  QueryValue | QueryValue[] | undefined
>;

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
  const s = params.toString();
  return s ? `?${s}` : "";
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export interface DiscordRequestResult {
  status: number;
  headers: Record<string, string>;
  body: unknown;
  rawBody: string;
}

const MAX_ATTEMPTS = 10;

export async function discordRequest(
  config: AppConfig,
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

  const hasBody =
    body !== undefined &&
    body !== null &&
    method !== "GET" &&
    method !== "DELETE";

  if (hasBody) {
    baseHeaders["Content-Type"] = "application/json";
  }
  if (auditReason?.trim()) {
    baseHeaders["X-Audit-Log-Reason"] = encodeURIComponent(auditReason.trim());
  }

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const headers = { ...baseHeaders };
    const res = await fetch(url, {
      method,
      headers,
      body: hasBody ? JSON.stringify(body) : undefined,
    });

    const text = await res.text();
    let parsed: unknown = text;
    const ct = res.headers.get("content-type") || "";
    if (text.length && ct.includes("application/json")) {
      try {
        parsed = JSON.parse(text) as unknown;
      } catch {
        parsed = text;
      }
    } else if (!text.length) {
      parsed = null;
    }

    const headerObj: Record<string, string> = {};
    res.headers.forEach((v, k) => {
      headerObj[k] = v;
    });

    if (res.status === 429 && attempt < MAX_ATTEMPTS) {
      const retryAfter = res.headers.get("retry-after");
      const sec = retryAfter ? parseFloat(retryAfter) : NaN;
      const ms = Number.isFinite(sec)
        ? Math.ceil(sec * 1000)
        : Math.min(1000 * 2 ** (attempt - 1), 30_000);
      await sleep(ms);
      continue;
    }

    return {
      status: res.status,
      headers: headerObj,
      body: parsed,
      rawBody: text,
    };
  }

  throw new Error("discordRequest: exhausted retries (unexpected)");
}
