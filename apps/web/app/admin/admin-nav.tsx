"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const nav = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/models", label: "Models" },
  { href: "/admin/config", label: "Config" },
  { href: "/admin/runs", label: "Runs" },
  { href: "/admin/mcp", label: "MCP" },
  { href: "/admin/oversight", label: "Oversight" },
  { href: "/admin/observability", label: "Observability" },
  { href: "/admin/pending", label: "Pending actions" },
  { href: "/admin/confirmations", label: "Confirmations (legacy)" },
  { href: "/admin/audit", label: "Audit" },
  { href: "/admin/settings", label: "Settings" },
] as const;

function linkActive(pathname: string, href: string): boolean {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AdminNav() {
  const pathname = usePathname() ?? "";
  return (
    <nav className="flex flex-col gap-0.5 text-sm min-w-0">
      {nav.map((item) => {
        const active = linkActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            prefetch={false}
            aria-current={active ? "page" : undefined}
            className={
              "rounded-md px-3 py-2 text-left break-words leading-snug transition-colors outline-none focus-visible:ring-2 focus-visible:ring-zinc-600 " +
              (active
                ? "bg-zinc-800 text-white font-medium"
                : "text-zinc-300 hover:bg-zinc-800/90 hover:text-white")
            }
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
