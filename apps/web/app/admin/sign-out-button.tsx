"use client";

export function SignOutButton() {
  return (
    <button
      type="button"
      className="w-full text-left text-sm text-zinc-500 hover:text-zinc-200"
      onClick={async () => {
        await fetch("/api/admin/logout", { method: "POST" });
        window.location.href = "/admin/login";
      }}
    >
      Sign out
    </button>
  );
}
