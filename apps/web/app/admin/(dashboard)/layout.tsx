import Image from "next/image";
import { SignOutButton } from "../sign-out-button";
import { AdminNav } from "../admin-nav";

export default function AdminShellLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex bg-zinc-950 text-zinc-100">
      <aside className="w-64 shrink-0 border-r border-zinc-800 py-4 px-3 flex flex-col gap-6 min-h-0 overflow-y-auto">
        <div className="flex items-center gap-2 px-1 min-w-0">
          <Image src="/logo.svg" alt="Agent Z" width={28} height={28} className="rounded shrink-0" />
          <span className="font-semibold tracking-tight font-sans truncate">Agent Z</span>
        </div>
        <AdminNav />
        <div className="mt-auto pt-2 border-t border-zinc-800/80">
          <SignOutButton />
        </div>
      </aside>
      <div className="flex-1 flex flex-col min-w-0">
        <header className="min-h-12 border-b border-zinc-800 flex items-center px-6 py-2 text-sm text-zinc-500">
          Control plane
        </header>
        <main className="p-6 flex-1 overflow-auto min-w-0">{children}</main>
      </div>
    </div>
  );
}
