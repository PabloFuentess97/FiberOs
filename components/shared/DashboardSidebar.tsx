"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Box, Cable, LayoutDashboard, Map, Package, Search, Settings, Users } from "lucide-react";
import { cn } from "@/lib/utils/cn";

const NAV = [
  { href: "", label: "Dashboard", icon: LayoutDashboard },
  { href: "map", label: "Mapa", icon: Map },
  { href: "boxes", label: "Cajas", icon: Box },
  { href: "cables", label: "Cables", icon: Cable },
  { href: "splitters", label: "Splitters", icon: Package },
  { href: "clients", label: "Clientes", icon: Users },
  { href: "search", label: "Búsqueda", icon: Search },
  { href: "settings/organization", label: "Ajustes", icon: Settings },
];

export function DashboardSidebar({ tenantName }: { tenantName: string }) {
  const path = usePathname();

  // Quitamos el prefijo /t/[slug] para comparar activos (middleware lo inyecta via rewrite)
  const stripped = path.replace(/^\/(?:t\/[^/]+)?/, "") || "/";

  return (
    <aside className="flex w-60 flex-col border-r border-[var(--color-border)] bg-white">
      <div className="flex h-14 items-center gap-2 border-b border-[var(--color-border)] px-4 font-semibold">
        <span className="inline-block h-6 w-6 rounded bg-[var(--brand-primary)]" />
        <span className="truncate">{tenantName}</span>
      </div>
      <nav className="flex-1 overflow-y-auto p-2">
        {NAV.map(({ href, label, icon: Icon }) => {
          const target = `/${href}`;
          const active =
            target === "/" ? stripped === "/" : stripped === target || stripped.startsWith(`${target}/`);
          return (
            <Link
              key={label}
              href={target}
              className={cn(
                "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-[var(--color-surface)] text-[var(--color-foreground)] font-medium"
                  : "text-[var(--color-muted)] hover:bg-[var(--color-surface)]",
              )}
            >
              <Icon size={16} />
              {label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
