import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * This app is `apps/discord-mcp`. Historically `app/api/[transport]` treated `discord` as an MCP
 * transport and returned MCP `invalid_token` for Discord's interaction POSTs.
 *
 * Discord's URL must hit **apps/web** (`POST /api/discord`). If this hostname is what you put in the
 * Developer Portal, set `AGENT_Z_APP_BASE_URL` to your **web** deployment origin (another Vercel
 * project with Root Directory `apps/web`) and we proxy there. Same host → 503 (no loop).
 */
const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailers",
  "transfer-encoding",
  "upgrade",
  "host",
  "content-length",
]);

export async function POST(request: Request) {
  const raw = process.env.AGENT_Z_APP_BASE_URL?.trim();
  if (!raw) {
    return NextResponse.json(
      {
        error:
          "MCP host only: point the Interactions URL at your apps/web deployment (/api/discord), or set AGENT_Z_APP_BASE_URL to that origin so this path can proxy.",
      },
      { status: 503 }
    );
  }
  const base = raw.replace(/\/$/, "");
  let targetUrl: URL;
  try {
    targetUrl = new URL(`${base}/api/discord`);
  } catch {
    return NextResponse.json({ error: "Invalid AGENT_Z_APP_BASE_URL" }, { status: 503 });
  }
  const incoming = new URL(request.url);
  if (targetUrl.host === incoming.host) {
    return NextResponse.json(
      {
        error:
          "AGENT_Z_APP_BASE_URL cannot match this host (proxy loop). Create a Vercel project with Root Directory apps/web for Discord; keep this project for MCP only.",
      },
      { status: 503 }
    );
  }
  const body = await request.arrayBuffer();
  const outHeaders = new Headers();
  request.headers.forEach((value, key) => {
    if (!HOP_BY_HOP.has(key.toLowerCase())) {
      outHeaders.set(key, value);
    }
  });
  return fetch(targetUrl, {
    method: "POST",
    headers: outHeaders,
    body,
  });
}
