import { prisma } from "@repo/db";
import { ResumeForm } from "./ui";

export const dynamic = "force-dynamic";

export default async function ConfirmationsPage() {
  let rows: { id: string; status: string; summary: string; hookToken: string | null }[] = [];
  try {
    rows = await prisma.confirmation.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { id: true, status: true, summary: true, hookToken: true },
    });
  } catch {
    // ignore
  }
  return (
    <div className="max-w-3xl flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Confirmations</h1>
      <ul className="flex flex-col gap-2 text-sm">
        {rows.length === 0 ? (
          <li className="text-zinc-500">No confirmations.</li>
        ) : (
          rows.map((c) => (
            <li key={c.id} className="border border-zinc-800 rounded-md p-3 flex flex-col gap-2">
              <div>
                <span className="text-zinc-500">{c.status}</span> — {c.summary}
              </div>
              {c.hookToken && c.status === "pending" && <ResumeForm token={c.hookToken} />}
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
