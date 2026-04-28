import { prisma } from "@repo/db";

export const dynamic = "force-dynamic";

export default async function AuditPage() {
  let rows: { id: string; actor: string; action: string; target: string; createdAt: Date }[] = [];
  try {
    rows = await prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  } catch {
    // ignore
  }
  const csv = ["id,actor,action,target,createdAt"]
    .concat(
      rows.map(
        (r) =>
          `${r.id},${r.actor},${r.action},${r.target},${r.createdAt.toISOString()}`
      )
    )
    .join("\n");
  return (
    <div className="max-w-5xl flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Audit</h1>
      <a
        href={`data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`}
        download="audit.csv"
        className="text-sm text-blue-400 w-fit"
      >
        Download CSV
      </a>
      <table className="w-full text-sm border border-zinc-800 rounded-md">
        <thead>
          <tr className="text-left text-zinc-500 border-b border-zinc-800">
            <th className="p-2">Time</th>
            <th className="p-2">Actor</th>
            <th className="p-2">Action</th>
            <th className="p-2">Target</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-zinc-900">
              <td className="p-2 font-mono text-xs">{r.createdAt.toISOString()}</td>
              <td className="p-2">{r.actor}</td>
              <td className="p-2">{r.action}</td>
              <td className="p-2 font-mono text-xs">{r.target}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
