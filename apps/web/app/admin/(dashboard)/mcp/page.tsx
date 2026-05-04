import { getMcpEnvPresence, introspectMcp } from "@/lib/mcp-introspect";
import Link from "next/link";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function McpPage() {
  const snapshot = await introspectMcp();
  const env = getMcpEnvPresence();
  const endpointLabel = snapshot.endpoint
    ? snapshot.endpoint
    : "Not set — add an MCP URL to this app’s environment";

  return (
    <div className="max-w-5xl flex flex-col gap-8">
      <header className="flex flex-col gap-3">
        <div>
          <h1 className="text-2xl font-semibold">MCP server</h1>
          <p className="text-sm text-zinc-400 mt-1 max-w-3xl">
            Live registry from your discord-mcp deployment (tools, resources, prompts). Data is fetched over
            JSON-RPC when you load or refresh this page — it is not stored in the database.
          </p>
        </div>

        <section className="rounded-lg border border-zinc-800 bg-zinc-900/30 p-4 flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-medium text-zinc-200">Environment checklist</h2>
            <Link href="/admin/settings" className="text-xs text-sky-400 hover:text-sky-300 hover:underline">
              Webhook &amp; docs
            </Link>
          </div>
          <p className="text-xs text-zinc-500">
            MCP URL and API keys are configured on the server (e.g. <code className="font-mono text-zinc-400">apps/web/.env</code>{" "}
            or Vercel project env). This admin UI cannot change secrets; it only shows whether they are present and
            whether the server responds.
          </p>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-xs font-mono">
            <EnvRow ok={env.discordMcpUrl} label="DISCORD_MCP_URL" hint="same URL the in-app agent uses (…/api/mcp)" />
            <EnvRow ok={env.mcpApiKey} label="DISCORD_MCP_API_KEY" hint="bearer token; match MCP_API_KEY on discord-mcp" />
            <EnvRow ok={env.mcpEndpointUrl} label="MCP_ENDPOINT_URL (optional)" hint="full URL override for this page only" />
            <EnvRow ok={env.mcpBaseUrl} label="MCP_BASE_URL (optional)" hint="deployment origin; we append /api/mcp" />
            <EnvRow ok={env.agentZMcpToken} label="AGENT_Z_MCP_TOKEN (optional)" hint="alternate secret name for bearer auth" />
          </ul>
        </section>

        <div className="flex flex-col gap-2">
          <p className="text-xs text-zinc-500 uppercase tracking-wide">Resolved endpoint</p>
          <code className="font-mono text-sm text-zinc-200 break-all rounded border border-zinc-800 bg-zinc-950 px-3 py-2">
            {endpointLabel}
          </code>
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <span
              className={
                "rounded-full px-2 py-0.5 font-medium " +
                (snapshot.available
                  ? "bg-emerald-500/15 text-emerald-300"
                  : "bg-rose-500/15 text-rose-300")
              }
            >
              {snapshot.available ? "Reachable" : "Unreachable"}
            </span>
            {snapshot.serverInfo ? (
              <span className="text-zinc-400 font-mono">
                {snapshot.serverInfo.name} v{snapshot.serverInfo.version}
              </span>
            ) : null}
            {snapshot.error ? (
              <span className="text-rose-400 text-sm max-w-prose">{snapshot.error}</span>
            ) : null}
          </div>
        </div>
      </header>

      <Section
        title="Tools"
        empty="No tools registered."
        count={snapshot.tools.length}
      >
        <ul className="flex flex-col gap-2">
          {snapshot.tools.map((tool) => (
            <li
              key={tool.name}
              className="rounded-md border border-zinc-800 bg-zinc-900/40 p-3"
            >
              <div className="flex items-baseline gap-3">
                <code className="font-mono text-sm text-zinc-100">{tool.name}</code>
                {tool.title ? (
                  <span className="text-xs text-zinc-500">{tool.title}</span>
                ) : null}
              </div>
              {tool.description ? (
                <p className="mt-1 text-sm text-zinc-400 leading-relaxed">
                  {tool.description}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      </Section>

      <Section
        title="Resources"
        empty="No static resources registered."
        count={snapshot.resources.length}
      >
        <ul className="flex flex-col gap-2">
          {snapshot.resources.map((r) => (
            <li
              key={r.uri}
              className="rounded-md border border-zinc-800 bg-zinc-900/40 p-3"
            >
              <code className="font-mono text-sm text-zinc-100">{r.uri}</code>
              {r.name ? (
                <span className="ml-2 text-xs text-zinc-500">{r.name}</span>
              ) : null}
              {r.description ? (
                <p className="mt-1 text-sm text-zinc-400 leading-relaxed">
                  {r.description}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      </Section>

      <Section
        title="Resource templates"
        empty="No resource templates registered."
        count={snapshot.resourceTemplates.length}
      >
        <ul className="flex flex-col gap-2">
          {snapshot.resourceTemplates.map((t) => (
            <li
              key={t.uriTemplate}
              className="rounded-md border border-zinc-800 bg-zinc-900/40 p-3"
            >
              <code className="font-mono text-sm text-zinc-100">{t.uriTemplate}</code>
              {t.name ? (
                <span className="ml-2 text-xs text-zinc-500">{t.name}</span>
              ) : null}
              {t.description ? (
                <p className="mt-1 text-sm text-zinc-400 leading-relaxed">
                  {t.description}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      </Section>

      <Section
        title="Prompts"
        empty="No prompts registered."
        count={snapshot.prompts.length}
      >
        <ul className="flex flex-col gap-2">
          {snapshot.prompts.map((p) => (
            <li
              key={p.name}
              className="rounded-md border border-zinc-800 bg-zinc-900/40 p-3"
            >
              <div className="flex items-baseline gap-3">
                <code className="font-mono text-sm text-zinc-100">{p.name}</code>
                {p.title ? (
                  <span className="text-xs text-zinc-500">{p.title}</span>
                ) : null}
              </div>
              {p.description ? (
                <p className="mt-1 text-sm text-zinc-400 leading-relaxed">
                  {p.description}
                </p>
              ) : null}
              {p.arguments && p.arguments.length > 0 ? (
                <ul className="mt-2 flex flex-wrap gap-2 text-xs">
                  {p.arguments.map((a) => (
                    <li
                      key={a.name}
                      className="rounded border border-zinc-700 bg-zinc-950 px-2 py-0.5 font-mono text-zinc-300"
                    >
                      {a.name}
                      {a.required ? "*" : ""}
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}

function EnvRow({ ok, label, hint }: { ok: boolean; label: string; hint: string }) {
  return (
    <li className="flex gap-2 items-start">
      <span className={ok ? "text-emerald-400 shrink-0" : "text-zinc-600 shrink-0"} aria-hidden>
        {ok ? "✓" : "○"}
      </span>
      <span>
        <span className={ok ? "text-zinc-200" : "text-zinc-500"}>{label}</span>
        <span className="text-zinc-600 block font-sans normal-case"> — {hint}</span>
      </span>
    </li>
  );
}

function Section({
  title,
  count,
  empty,
  children,
}: {
  title: string;
  count: number;
  empty: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <header className="flex items-baseline justify-between border-b border-zinc-800 pb-2">
        <h2 className="text-lg font-semibold">{title}</h2>
        <span className="text-xs text-zinc-500 font-mono">{count}</span>
      </header>
      {count === 0 ? <p className="text-sm text-zinc-500">{empty}</p> : children}
    </section>
  );
}
