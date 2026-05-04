import { loadOversightStats } from "@/lib/oversight-stats";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function OversightPage() {
  const stats = await loadOversightStats();
  const embeddedPct =
    stats.total === 0 ? 0 : Math.round((stats.embedded / stats.total) * 100);

  return (
    <div className="max-w-5xl flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">Oversight</h1>
        <p className="text-sm text-zinc-400">
          Live view of the message archive that backs <code className="font-mono text-zinc-200">search_server_messages</code>.
          The gateway forwards <code className="font-mono">MESSAGE_CREATE/UPDATE/DELETE</code> events to{" "}
          <code className="font-mono">/api/discord/oversight</code> when{" "}
          <code className="font-mono">AGENT_Z_OVERSIGHT_ENABLED=true</code>.
        </p>
      </header>

      <section className="grid gap-3 grid-cols-2 md:grid-cols-4">
        <Stat label="Archived messages" value={stats.total.toLocaleString()} />
        <Stat
          label="Embedded"
          value={`${stats.embedded.toLocaleString()} (${embeddedPct}%)`}
          tone={embeddedPct < 80 ? "warn" : "ok"}
        />
        <Stat
          label="Awaiting embed"
          value={stats.pendingEmbed.toLocaleString()}
          tone={stats.pendingEmbed > 1000 ? "warn" : "ok"}
        />
        <Stat
          label="Stream depth"
          value={stats.queueDepth.toLocaleString()}
          tone={stats.queueDepth > 1000 ? "warn" : "ok"}
        />
        <Stat label="Last 24h" value={stats.last24h.toLocaleString()} />
      </section>

      <section className="flex flex-col gap-3">
        <header className="flex items-baseline justify-between border-b border-zinc-800 pb-2">
          <h2 className="text-lg font-semibold">Recent messages</h2>
          <span className="text-xs text-zinc-500">Newest 20</span>
        </header>
        {stats.recent.length === 0 ? (
          <p className="text-sm text-zinc-500">
            Nothing archived yet. Check that{" "}
            <code className="font-mono">AGENT_Z_OVERSIGHT_ENABLED</code>,{" "}
            <code className="font-mono">KV_REST_API_URL</code>, and{" "}
            <code className="font-mono">AGENT_Z_GATEWAY_TOKEN</code> are set, then post a
            message in any monitored channel.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {stats.recent.map((m) => (
              <li
                key={m.id}
                className="rounded-md border border-zinc-800 bg-zinc-900/40 p-3"
              >
                <div className="flex items-baseline justify-between gap-3 text-xs text-zinc-500">
                  <span className="font-mono">
                    #{m.channelId} · {m.authorName ?? "unknown"}
                    {m.authorIsBot ? " (bot)" : ""}
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="font-mono">{m.sentAt.toISOString()}</span>
                    <span
                      className={
                        "rounded-full px-1.5 py-0.5 text-[10px] " +
                        (m.embeddedAt
                          ? "bg-emerald-500/15 text-emerald-300"
                          : "bg-amber-500/15 text-amber-300")
                      }
                    >
                      {m.embeddedAt ? "embedded" : "queued"}
                    </span>
                  </span>
                </div>
                <p className="mt-1 text-sm text-zinc-200 leading-relaxed whitespace-pre-wrap break-words">
                  {m.content || "(no content — likely an attachment-only message)"}
                </p>
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
          "mt-1 text-lg font-semibold " +
          (tone === "warn" ? "text-amber-300" : "text-zinc-100")
        }
      >
        {value}
      </div>
    </div>
  );
}
