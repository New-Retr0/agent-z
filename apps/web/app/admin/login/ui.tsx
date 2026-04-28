"use client";

import { useState } from "react";
import { getSafeAdminRedirect } from "@/lib/safe-redirect";

export function LoginForm({ next }: { next?: string }) {
  const [err, setErr] = useState<string | null>(null);
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setErr(null);
        const fd = new FormData(e.currentTarget);
        const password = String(fd.get("password") ?? "");
        const res = await fetch("/api/admin/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password }),
        });
        if (!res.ok) {
          setErr(res.status === 503 ? "Admin secret is not configured." : "Invalid secret");
          return;
        }
        window.location.href = getSafeAdminRedirect(next);
      }}
    >
      <input
        name="password"
        type="password"
        autoComplete="off"
        className="rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm"
        placeholder="Admin secret"
        required
      />
      {err && <p className="text-sm text-red-400">{err}</p>}
      <button
        type="submit"
        className="rounded-md bg-zinc-100 text-zinc-900 py-2 text-sm font-medium"
      >
        Sign in
      </button>
    </form>
  );
}
