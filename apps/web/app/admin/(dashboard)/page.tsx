import { prisma } from "@repo/db";

export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  let runsToday = 0;
  let tokens = 0;
  let recent: { id: string; tier: string; status: string; startedAt: Date }[] = [];
  try {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const agg = await prisma.agentRun.aggregate({
      where: { startedAt: { gte: start } },
      _sum: { tokensIn: true, tokensOut: true },
      _count: true,
    });
    runsToday = agg._count;
    tokens = (agg._sum.tokensIn ?? 0) + (agg._sum.tokensOut ?? 0);
    recent = await prisma.agentRun.findMany({
      orderBy: { startedAt: "desc" },
      take: 20,
      select: { id: true, tier: true, status: true, startedAt: true },
    });
  } catch {
    // DB not configured
  }

  return (
    <div className="flex flex-col gap-8 max-w-5xl">
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-lg border border-zinc-800 p-4">
          <p className="text-xs text-zinc-500 uppercase">Today&apos;s runs</p>
          <p className="text-2xl font-mono">{runsToday}</p>
        </div>
        <div className="rounded-lg border border-zinc-800 p-4">
          <p className="text-xs text-zinc-500 uppercase">Tokens (in+out)</p>
          <p className="text-2xl font-mono">{tokens}</p>
        </div>
        <div className="rounded-lg border border-zinc-800 p-4">
          <p className="text-xs text-zinc-500 uppercase">Status</p>
          <p className="text-lg">Webhook mode</p>
        </div>
      </div>
      <div>
        <h2 className="text-sm font-medium text-zinc-400 mb-2">Recent runs</h2>
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
                  <tr key={r.id} className="border-t border-zinc-800">
                    <td className="p-2 font-mono text-xs">{r.id.slice(0, 8)}…</td>
                    <td className="p-2">{r.tier}</td>
                    <td className="p-2">{r.status}</td>
                    <td className="p-2 text-zinc-400">{r.startedAt.toISOString()}</td>
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
