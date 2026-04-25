"use client";

import { useState } from "react";
import { LogOut, UserCircle } from "lucide-react";
import { signOut } from "@/lib/auth/client";
import { useRouter } from "next/navigation";

export function TopBar({ email, role }: { email: string; role: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  async function onLogout() {
    await signOut();
    const root = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "fibraos.local";
    const scheme = process.env.NODE_ENV === "production" ? "https" : "http";
    const port = process.env.NODE_ENV === "production" ? "" : ":3000";
    router.replace(`${scheme}://app.${root}${port}/login`);
  }

  function openSearch() {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }));
  }

  return (
    <header className="flex h-14 items-center justify-between border-b border-[var(--color-border)] bg-white px-6">
      <button
        type="button"
        onClick={openSearch}
        className="flex items-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1 text-xs text-[var(--color-muted)] hover:bg-white"
      >
        <span>Buscar…</span>
        <kbd className="rounded bg-white px-1.5 py-0.5 font-mono text-[10px]">⌘K</kbd>
      </button>
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-white px-3 py-1 text-sm hover:bg-[var(--color-surface)]"
        >
          <UserCircle size={18} />
          <span className="max-w-[140px] truncate">{email}</span>
          <span className="rounded bg-[var(--color-surface)] px-1.5 py-0.5 text-xs uppercase tracking-wide">
            {role}
          </span>
        </button>
        {open ? (
          <div className="absolute right-0 mt-1 w-44 rounded-md border border-[var(--color-border)] bg-white py-1 shadow-md">
            <button
              type="button"
              onClick={onLogout}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-[var(--color-surface)]"
            >
              <LogOut size={14} /> Cerrar sesión
            </button>
          </div>
        ) : null}
      </div>
    </header>
  );
}
