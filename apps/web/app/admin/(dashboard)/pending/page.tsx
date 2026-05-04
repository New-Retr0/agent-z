import { prisma } from "@repo/db";

export const dynamic = "force-dynamic";

/** Discord-staged destructive actions (Confirm/Cancel in ephemeral). */
export default async function PendingActionsPage() {
  type Row = {
    id: string;
    token: string;
    capability: string;
    summary: string;
    status: string;
    invokerUserId: string;
    createdAt: Date;
    resolvedAt: Date | null;
    expiresAt: Date;
    resultText: string | null;
  };
  let rows: Row[] = [];
  try {
    rows = await prisma.pendingAction.findMany({
      orderBy: { createdAt: "desc" },
      take: 200,
      select: {
        id: true,
        token: true,
        capability: true,
        summary: true,
        status: true,
        invokerUserId: true,
        createdAt: true,
        resolvedAt: true,
        expiresAt: true,
        resultText: true,
      },
    });
  } catch {
    // DB missing in some dev setups
  }

  return (
    <div className="max-w-4xl flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Pending Discord actions</h1>
      <p className="text-sm text-zinc-500">
        Rows created when <code className="text-zinc-300">/agent-z-admin</code> stages a destructive tool. The invoker
        confirms in Discord; this page is read-only for audit.
      </p>
      <ul className="flex flex-col gap-2 text-sm">
        {rows.length === 0 ? (
          <li className="text-zinc-500">No pending actions yet.</li>
        ) : (
          rows.map((r) => (
            <li key={r.id} className="border border-zinc-800 rounded-md p-3 flex flex-col gap-1 font-mono text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span
                  className={
                    r.status === "executed"
                      ? "text-emerald-400 uppercase"
                      : r.status === "pending"
                        ? "text-amber-400 uppercase"
                        : r.status === "cancelled"
                          ? "text-zinc-400 uppercase"
                          : "text-red-400 uppercase"
                  }
                >
                  {r.status}
                </span>
                <span className="text-zinc-500">{r.createdAt.toISOString().slice(0, 19).replace("T", " ")}</span>
              </div>
              <div className="text-zinc-200 whitespace-pre-wrap">{r.summary}</div>
              <div className="text-zinc-500">
                token {r.token} · cap {r.capability} · user {r.invokerUserId}
              </div>
              <div className="text-zinc-500">expires {r.expiresAt.toISOString().slice(0, 19)}</div>
              {r.resolvedAt ? <div className="text-zinc-500">resolved {r.resolvedAt.toISOString().slice(0, 19)}</div> : null}
              {r.resultText ? (
                <pre className="text-zinc-400 mt-1 max-h-40 overflow-auto text-[11px]">{r.resultText}</pre>
              ) : null}
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
