import Image from "next/image";
import Link from "next/link";
import { SignOutButton } from "../sign-out-button";

const nav = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/models", label: "Models" },
  { href: "/admin/config", label: "Config" },
  { href: "/admin/runs", label: "Runs" },
  { href: "/admin/mcp", label: "MCP" },
  { href: "/admin/oversight", label: "Oversight" },
  { href: "/admin/confirmations", label: "Confirmations" },
  { href: "/admin/audit", label: "Audit" },
  { href: "/admin/knowledge", label: "Knowledge" },
  { href: "/admin/settings", label: "Settings" },
] as const;

export default function AdminShellLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex bg-zinc-950 text-zinc-100">
      <aside className="w-60 shrink-0 border-r border-zinc-800 p-4 flex flex-col gap-6">
        <div className="flex items-center gap-2">
          <Image src="/logo.svg" alt="Agent Z" width={28} height={28} className="rounded" />
          <span className="font-semibold tracking-tight font-sans">Agent Z</span>
        </div>
        <nav className="flex flex-col gap-1 text-sm">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-md px-2 py-1.5 text-zinc-300 hover:bg-zinc-800 hover:text-white"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto">
          <SignOutButton />
        </div>
      </aside>
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-12 border-b border-zinc-800 flex items-center px-6 text-sm text-zinc-500">
          Control plane
        </header>
        <main className="p-6 flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
