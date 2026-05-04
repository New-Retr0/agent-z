import { getRuntimeConfig } from "@repo/config/runtime-config";
import { getMcpEnvPresence } from "@/lib/mcp-introspect";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const base =
    process.env.VERCEL_URL != null
      ? `https://${process.env.VERCEL_URL}`
      : `http://localhost:${process.env.PORT ?? "3000"}`;
  const rc = await getRuntimeConfig();
  const mcpEnv = getMcpEnvPresence();
  const mcpReady = mcpEnv.discordMcpUrl && mcpEnv.mcpApiKey;
  return (
    <div className="max-w-2xl flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Settings</h1>
      <p className="text-sm text-zinc-500">
        Read-only reference for this deployment. Values come from environment variables; edit them in{" "}
        <code className="font-mono text-zinc-400">apps/web/.env</code> or your host (e.g. Vercel), then redeploy or
        restart if needed.
      </p>
      <div className="text-sm flex flex-col gap-3">
        <p>
          <span className="text-zinc-500">Discord interactions URL: </span>
          <code className="font-mono text-xs break-all text-zinc-300">{base}/api/discord</code>
        </p>
        <p>
          <span className="text-zinc-500">Welcome DM template (from database): </span>
          <span className="text-zinc-300">{rc.welcomeDmTemplate.slice(0, 120)}…</span>
        </p>
      </div>

      <section className="rounded-lg border border-zinc-800 bg-zinc-900/30 p-4 flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-medium text-zinc-200">MCP (environment)</h2>
          <Link href="/admin/mcp" className="text-xs text-sky-400 hover:text-sky-300 hover:underline">
            Open MCP page
          </Link>
        </div>
        <p className={`text-xs font-medium ${mcpReady ? "text-emerald-400" : "text-amber-400"}`}>
          {mcpReady
            ? "DISCORD_MCP_URL and DISCORD_MCP_API_KEY are set (connection still subject to network / MCP project)."
            : "Incomplete — set DISCORD_MCP_URL and DISCORD_MCP_API_KEY for in-app tools and the MCP admin view."}
        </p>
        <ul className="text-xs text-zinc-500 font-mono grid gap-1">
          <li>DISCORD_MCP_URL: {mcpEnv.discordMcpUrl ? "set" : "missing"}</li>
          <li>DISCORD_MCP_API_KEY: {mcpEnv.mcpApiKey ? "set" : "missing"}</li>
          <li>MCP_ENDPOINT_URL: {mcpEnv.mcpEndpointUrl ? "set" : "—"}</li>
          <li>MCP_BASE_URL: {mcpEnv.mcpBaseUrl ? "set" : "—"}</li>
          <li>AGENT_Z_MCP_TOKEN: {mcpEnv.agentZMcpToken ? "set" : "—"}</li>
        </ul>
      </section>

      <p className="text-zinc-500 text-xs">
        OIDC: use <code className="font-mono text-zinc-400">vercel env pull</code> for AI Gateway. Re-register commands
        via a one-shot script (see repository AGENTS.md).
      </p>
    </div>
  );
}
