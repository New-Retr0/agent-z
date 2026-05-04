import Link from "next/link";
import { prisma, getEmbedQueueDepth } from "@repo/db";
import { getRuntimeConfig } from "@repo/config/runtime-config";
import { introspectMcp } from "@/lib/mcp-introspect";
import { formatRelativeAgo } from "@/lib/format-admin-time";

export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  let runsToday = 0;
  let tokens = 0;
  let recent: { id: string; tier: string; status: string; startedAt: Date }[] = [];
  let archivedToday = 0;
  let embedBacklog = 0;
  let queueDepth = 0;
  let verifiedToday = 0;
  try {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const [agg, recentRuns, msgsToday, pendingEmbed, depth, verifiesToday] = await Promise.all([
      prisma.agentRun.aggregate({
        where: { startedAt: { gte: start } },
        _sum: { tokensIn: true, tokensOut: true },
        _count: true,
      }),
      prisma.agentRun.findMany({
        orderBy: { startedAt: "desc" },
        take: 20,
        select: { id: true, tier: true, status: true, startedAt: true },
      }),
      prisma.message.count({ where: { sentAt: { gte: start } } }),
      prisma.message.count({ where: { embeddedAt: null } }),
      getEmbedQueueDepth().catch(() => 0),
      prisma.verificationGrant.count({ where: { grantedAt: { gte: start } } }),
    ]);
    runsToday = agg._count;
    tokens = (agg._sum.tokensIn ?? 0) + (agg._sum.tokensOut ?? 0);
    recent = recentRuns;
    archivedToday = msgsToday;
    embedBacklog = pendingEmbed;
    queueDepth = depth;
    verifiedToday = verifiesToday;
  } catch {
    // DB not configured
  }
  const [rc, mcp] = await Promise.all([getRuntimeConfig(), introspectMcp()]);
  const verifyConfigured = Boolean(rc.verifiedRoleId && rc.verifyChannelId);

  return (
    <div className="flex flex-col gap-8 max-w-5xl">
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Activity and health for Agent Z. Open a card to drill into details or change settings.
        </p>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Stat label="Today's runs" value={runsToday.toLocaleString()} href="/admin/runs" />
        <Stat label="Tokens (in+out)" value={tokens.toLocaleString()} />
        <Stat
          label="Archived today"
          value={archivedToday.toLocaleString()}
          href="/admin/oversight"
          tone={archivedToday === 0 ? "muted" : "ok"}
        />
        <Stat
          label="Embed backlog"
          value={`${embedBacklog.toLocaleString()} (queue ${queueDepth.toLocaleString()})`}
          href="/admin/oversight"
          tone={embedBacklog > 1000 || queueDepth > 1000 ? "warn" : "ok"}
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Stat
          label="MCP server"
          value={mcp.available ? "Connected" : "Not connected"}
          href="/admin/mcp"
          tone={mcp.available ? "ok" : "warn"}
          hint={
            mcp.available
              ? `${mcp.tools.length} tools · ${mcp.serverInfo?.name ?? "MCP"} v${mcp.serverInfo?.version ?? "—"}`
              : mcp.error ?? "Configure environment variables (see MCP page)."
          }
        />
        <Stat
          label="Verify on reaction"
          value={verifyConfigured ? "Active" : "Not configured"}
          href="/admin/config#verify-on-reaction"
          tone={verifyConfigured ? "ok" : "warn"}
          hint={
            verifyConfigured
              ? `${verifiedToday} granted today`
              : "Open Config and set verified role + verify channel."
          }
        />
        <Stat
          label="Active model"
          value={rc.modelId}
          href="/admin/models"
          tone="muted"
          hint="Change under Models →"
        />
      </div>
      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-medium text-zinc-400">Recent runs</h2>
          <Link href="/admin/runs" className="text-xs text-zinc-500 hover:text-zinc-300">
            View all
          </Link>
        </div>
        <div className="rounded-lg border border-zinc-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-zinc-900 text-left text-zinc-500">
              <tr>
                <th className="p-2">ID</th>
                <th className="p-2">Tier</th>
                <th className="p-2">Status</th>
                <th className="p-2">Started</th>
              </tr>
            </thead>
            <tbody>
              {recent.length === 0 ? (
                <tr>
                  <td colSpan={4} className="p-4 text-zinc-500">
                    No runs yet (or database not connected).
                  </td>
                </tr>
              ) : (
                recent.map((r) => (
                  <tr key={r.id} className="border-t border-zinc-800 hover:bg-zinc-900/40">
                    <td className="p-2">
                      <Link
                        href={`/admin/runs/${r.id}`}
                        className="font-mono text-xs text-sky-400 hover:text-sky-300 hover:underline"
                      >
                        {r.id.slice(0, 8)}…
                      </Link>
                    </td>
                    <td className="p-2">{r.tier}</td>
                    <td className="p-2">{r.status}</td>
                    <td className="p-2 text-zinc-400 tabular-nums">
                      <span title={r.startedAt.toISOString()}>{formatRelativeAgo(r.startedAt)}</span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  href,
  tone = "ok",
  hint,
}: {
  label: string;
  value: string;
  href?: string;
  tone?: "ok" | "warn" | "muted";
  hint?: string;
}) {
  const valueClass =
    tone === "warn"
      ? "text-amber-300"
      : tone === "muted"
        ? "text-zinc-300"
        : "text-zinc-100";
  const inner = (
    <div className="rounded-lg border border-zinc-800 p-4 hover:border-zinc-700 transition-colors h-full flex flex-col gap-1">
      <p className="text-xs text-zinc-500 uppercase tracking-wide">{label}</p>
      <p className={`text-xl sm:text-2xl font-mono leading-tight break-words ${valueClass}`}>{value}</p>
      {hint ? (
        <p className="text-xs text-zinc-500 mt-1 break-words line-clamp-4" title={hint.length > 120 ? hint : undefined}>
          {hint}
        </p>
      ) : null}
    </div>
  );
  return href ? (
    <Link href={href} className="block">
      {inner}
    </Link>
  ) : (
    inner
  );
}
