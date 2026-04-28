"use client";

export function ResumeForm({ token }: { token: string }) {
  return (
    <div className="flex gap-2">
      <button
        type="button"
        className="text-xs rounded bg-emerald-900/50 px-2 py-1"
        onClick={async () => {
          await fetch("/api/admin/hooks/resume", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token, approved: true }),
          });
          location.reload();
        }}
      >
        Approve
      </button>
      <button
        type="button"
        className="text-xs rounded bg-red-900/50 px-2 py-1"
        onClick={async () => {
          await fetch("/api/admin/hooks/resume", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token, approved: false }),
          });
          location.reload();
        }}
      >
        Reject
      </button>
    </div>
  );
}
