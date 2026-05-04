import { getObservabilitySnapshot } from "@/lib/admin/observability-snapshot";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ObservabilityPage() {
  const snap = await getObservabilitySnapshot();

  return (
    <div className="max-w-5xl flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">Observability</h1>
        <p className="text-sm text-zinc-400">
          Cached snapshot for Agent Z ops — model routing, MCP tool exposure, Oversight backlog, staged actions,
          and AI Gateway catalog size (usage/cost lives in the{" "}
          <a className="text-sky-400 hover:underline" href="https://vercel.com/dashboard">
            AI Gateway dashboard
          </a>
          ). Tag <code className="font-mono text-zinc-200">observability</code> · revalidate ~60s.
        </p>
        <p className="text-xs text-zinc-500 font-mono">fetchedAt: {snap.fetchedAt}</p>
      </header>

      <section className="grid gap-3 grid-cols-2 md:grid-cols-4">
        <Stat label="Runtime model" value={snap.modelId} />
        <Stat
          label="MCP tools (discord_)"
          value={`${snap.mcpDiscordTools} / ${snap.mcpTools}`}
          tone={snap.mcpAvailable && snap.mcpDiscordTools === 0 ? "warn" : "ok"}
        />
        <Stat
          label="AI Gateway catalog"
          value={snap.gatewayCatalogCount != null ? String(snap.gatewayCatalogCount) : "n/a"}
        />
        <Stat
          label="Oversight pending embed"
          value={snap.oversight ? String(snap.oversight.pendingEmbed) : "n/a"}
          tone={
            snap.oversight && snap.oversight.pendingEmbed > 2000 ? "warn" : "ok"
          }
        />
      </section>

      {!snap.mcpAvailable ? (
        <p className="text-sm text-amber-300 rounded-md border border-amber-900/50 bg-amber-950/30 p-3">
          MCP introspection failed{snap.mcpError ? `: ${snap.mcpError}` : "."} Check{" "}
          <code className="font-mono">DISCORD_MCP_URL</code> /{" "}
          <code className="font-mono">DISCORD_MCP_API_KEY</code> on apps/web.
        </p>
      ) : null}

      <section className="flex flex-col gap-3">
        <header className="flex items-baseline justify-between border-b border-zinc-800 pb-2">
          <h2 className="text-lg font-semibold">Recent staged actions</h2>
          <span className="text-xs text-zinc-500">Last 50</span>
        </header>
        {snap.pendingActions.length === 0 ? (
          <p className="text-sm text-zinc-500">No rows in pending_action.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {snap.pendingActions.map((p) => (
              <li
                key={p.id}
                className="rounded-md border border-zinc-800 bg-zinc-900/40 p-3 text-sm leading-snug break-words"
              >
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-zinc-500 font-mono">
                  <span>{p.token.slice(0, 22)}…</span>
                  <span className="text-zinc-300">{p.status}</span>
                  <span>{p.capability}</span>
                  <span>{p.createdAt.toISOString()}</span>
                </div>
                <p className="mt-1 text-zinc-200">{p.summary}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  tone = "ok",
}: {
  label: string;
  value: string;
  tone?: "ok" | "warn";
}) {
  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-900/40 p-3">
      <div className="text-xs text-zinc-500">{label}</div>
      <div
        className={
          "mt-1 text-sm font-semibold break-words " +
          (tone === "warn" ? "text-amber-300" : "text-zinc-100")
        }
      >
        {value}
      </div>
    </div>
  );
}
