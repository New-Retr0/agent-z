import { prisma } from "@repo/db";
import { notFound } from "next/navigation";
import Link from "next/link";
import type { AgentRun, AgentRunStep } from "@prisma/client";
import { formatRelativeAgo } from "@/lib/format-admin-time";

export const dynamic = "force-dynamic";

export default async function RunDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let run: AgentRun | null = null;
  let steps: AgentRunStep[] = [];
  let lookupFailed = false;
  try {
    run = await prisma.agentRun.findUnique({ where: { id } });
    if (run) {
      steps = await prisma.agentRunStep.findMany({
        where: { runId: id },
        orderBy: { stepIndex: "asc" },
      });
    }
  } catch {
    lookupFailed = true;
  }
  if (lookupFailed || !run) {
    notFound();
  }

  return (
    <div className="max-w-4xl flex flex-col gap-4">
      <p className="text-sm">
        <Link href="/admin/runs" className="text-sky-400 hover:text-sky-300 hover:underline">
          ← All runs
        </Link>
      </p>
      <h1 className="text-2xl font-semibold font-mono">Run {id}</h1>
      <p className="text-sm text-zinc-500">
        Started <span title={run.startedAt.toISOString()}>{formatRelativeAgo(run.startedAt)}</span>
        <span className="text-zinc-600"> · </span>
        <span className="uppercase">{run.status}</span>
        <span className="text-zinc-600"> · </span>
        tier {run.tier}
      </p>
      <pre className="text-xs font-mono overflow-auto p-3 rounded-md border border-zinc-800 bg-zinc-900">
        {JSON.stringify(run, null, 2)}
      </pre>
      <h2 className="text-lg font-medium">Steps</h2>
      {steps.length === 0 ? (
        <p className="text-zinc-500 text-sm">No steps stored.</p>
      ) : (
        <ol className="list-decimal pl-4 text-sm flex flex-col gap-2">
          {steps.map((s) => (
            <li key={s.id} className="font-mono text-xs">
              {s.text ?? "—"} {s.toolCalls ? JSON.stringify(s.toolCalls) : ""}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
