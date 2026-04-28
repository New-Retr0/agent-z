import { prisma } from "@repo/db";
import { notFound } from "next/navigation";
import type { AgentRun, AgentRunStep } from "@prisma/client";

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
      <h1 className="text-2xl font-semibold font-mono">Run {id}</h1>
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
