import { introspectMcp } from "@/lib/mcp-introspect";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function McpPage() {
  const snapshot = await introspectMcp();

  return (
    <div className="max-w-5xl flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">MCP server</h1>
        <p className="text-sm text-zinc-400">
          Live snapshot of <code className="font-mono text-zinc-200">{snapshot.endpoint || "(MCP_BASE_URL unset)"}</code>{" "}
          introspected via JSON-RPC. Updates on every refresh.
        </p>
        <div className="flex items-center gap-3 text-xs">
          <span
            className={
              "rounded-full px-2 py-0.5 font-medium " +
              (snapshot.available
                ? "bg-emerald-500/15 text-emerald-300"
                : "bg-rose-500/15 text-rose-300")
            }
          >
            {snapshot.available ? "Online" : "Unavailable"}
          </span>
          {snapshot.serverInfo ? (
            <span className="text-zinc-400 font-mono">
              {snapshot.serverInfo.name} v{snapshot.serverInfo.version}
            </span>
          ) : null}
          {snapshot.error ? (
            <span className="text-rose-400 font-mono">{snapshot.error}</span>
          ) : null}
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
