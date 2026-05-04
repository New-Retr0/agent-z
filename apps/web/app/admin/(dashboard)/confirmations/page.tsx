import { prisma } from "@repo/db";

export const dynamic = "force-dynamic";

/**
 * Read-only history of destructive-operation confirmations.
 *
 * The resume-via-Workflow-hook flow was retired with the Workflow SDK in
 * Phase 7. **Discord-staged destructive actions** (`/agent-z-admin`) use
 * ephemeral Confirm/Cancel buttons and are recorded in **`PendingAction`**;
 * see **Admin → Pending actions** (`/admin/pending`). This page is the legacy
 * `Confirmation` audit trail from client-side elicitation (Cursor/Claude); it
 * is preserved for staff review only.
 */
export default async function ConfirmationsPage() {
  let rows: {
    id: string;
    status: string;
    summary: string;
    createdAt: Date;
    resolvedAt: Date | null;
  }[] = [];
  try {
    rows = await prisma.confirmation.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        status: true,
        summary: true,
        createdAt: true,
        resolvedAt: true,
      },
    });
  } catch {
    // ignore — DB not configured in dev
  }
  return (
    <div className="max-w-3xl flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Confirmations</h1>
      <p className="text-xs text-zinc-500">
        Audit trail of destructive-tool requests. Approvals are now collected
        on the calling client via MCP elicitation; this page is read-only.
      </p>
      <ul className="flex flex-col gap-2 text-sm">
        {rows.length === 0 ? (
          <li className="text-zinc-500">No confirmations recorded.</li>
        ) : (
          rows.map((c) => (
            <li
              key={c.id}
              className="border border-zinc-800 rounded-md p-3 flex flex-col gap-1"
            >
              <div className="flex items-center justify-between gap-3">
                <span
                  className={
                    c.status === "approved"
                      ? "text-emerald-400 text-xs uppercase font-mono"
                      : c.status === "rejected"
                        ? "text-red-400 text-xs uppercase font-mono"
                        : "text-amber-400 text-xs uppercase font-mono"
                  }
                >
                  {c.status}
                </span>
                <time className="text-xs text-zinc-500 font-mono">
                  {c.createdAt.toISOString().slice(0, 19).replace("T", " ")}
                </time>
              </div>
              <div className="text-zinc-200">{c.summary}</div>
              {c.resolvedAt ? (
                <div className="text-xs text-zinc-500">
                  resolved {c.resolvedAt.toISOString().slice(0, 19).replace("T", " ")}
                </div>
              ) : null}
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
