import Link from "next/link";
import { prisma } from "@repo/db";

export const dynamic = "force-dynamic";

export default async function RunsPage() {
  let runs: { id: string; tier: string; status: string; startedAt: Date }[] = [];
  try {
    runs = await prisma.agentRun.findMany({
      orderBy: { startedAt: "desc" },
      take: 50,
      select: { id: true, tier: true, status: true, startedAt: true },
    });
  } catch {
    // no db
  }
  return (
    <div className="max-w-5xl flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Runs</h1>
      <ul className="flex flex-col gap-1 text-sm">
        {runs.length === 0 ? (
          <li className="text-zinc-500">No runs.</li>
        ) : (
          runs.map((r) => (
            <li key={r.id}>
              <Link href={`/admin/runs/${r.id}`} className="text-blue-400 hover:underline font-mono">
                {r.id}
              </Link>{" "}
              <span className="text-zinc-500">
                {r.tier} · {r.status} · {r.startedAt.toISOString()}
              </span>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
