"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Home, QrCode, Clock, WifiOff, Wifi } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { countPending } from "@/lib/field/db";
import { flushPending } from "@/lib/field/sync";

interface Props {
  tenantName: string;
  email: string;
  role: string;
  children: React.ReactNode;
}

export function FieldShell({ tenantName, email, role, children }: Props) {
  const path = usePathname();
  const [online, setOnline] = useState<boolean>(true);
  const [pending, setPending] = useState<number>(0);

  useEffect(() => {
    setOnline(navigator.onLine);
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);

  // Refrescar conteo de pendientes cada 2s (barato, todo en IndexedDB local)
  useEffect(() => {
    const tick = async () => setPending(await countPending());
    tick();
    const id = setInterval(tick, 2000);
    return () => clearInterval(id);
  }, []);

  // Auto-flush al recuperar red
  useEffect(() => {
    if (!online) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await flushPending();
        if (!cancelled) setPending(r.remaining);
      } catch {
        /* silent */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [online]);

  // Registrar SW una vez
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);

  const strip = path.replace(/^\/(?:t\/[^/]+)?/, "") || "/";

  const nav = [
    { href: "/field", label: "Inicio", icon: Home },
    { href: "/field/scan", label: "Escanear", icon: QrCode },
    { href: "/field/pending", label: `Pendientes${pending > 0 ? ` (${pending})` : ""}`, icon: Clock },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-[var(--color-background)]">
      <header className="sticky top-0 z-20 flex h-12 items-center justify-between border-b border-[var(--color-border)] bg-white px-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <span className="inline-block h-5 w-5 rounded bg-[var(--brand-primary)]" />
          <span className="truncate">{tenantName}</span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span
            aria-label={online ? "En línea" : "Sin conexión"}
            className={cn(
              "flex items-center gap-1 rounded-full px-2 py-0.5",
              online ? "bg-green-100 text-green-900" : "bg-amber-100 text-amber-900",
            )}
          >
            {online ? <Wifi size={12} /> : <WifiOff size={12} />}
            {online ? "Online" : "Offline"}
          </span>
          <span className="hidden truncate text-[var(--color-muted)] sm:inline">{email}</span>
          <span className="rounded bg-[var(--color-surface)] px-1.5 py-0.5 text-[10px] uppercase tracking-wide">
            {role}
          </span>
        </div>
      </header>

      <main className="flex-1 pb-16">{children}</main>

      <nav className="fixed inset-x-0 bottom-0 z-20 flex border-t border-[var(--color-border)] bg-white">
        {nav.map(({ href, label, icon: Icon }) => {
          const active = strip === href || strip.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px]",
                active ? "text-[var(--brand-primary)]" : "text-[var(--color-muted)]",
              )}
            >
              <Icon size={20} />
              {label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
