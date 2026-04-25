"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Box, Cable, Users, Zap } from "lucide-react";
import type { SearchHit } from "@/lib/db/queries/search";

const KIND_META: Record<SearchHit["kind"], { label: string; Icon: React.ComponentType<{ size?: number }> }> = {
  box: { label: "Caja", Icon: Box },
  cable: { label: "Cable", Icon: Cable },
  client: { label: "Cliente", Icon: Users },
  fiber: { label: "Fibra", Icon: Zap },
};

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Global shortcut cmd+K / ctrl+K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Autofocus al abrir + reset
  useEffect(() => {
    if (open) {
      setQuery("");
      setHits([]);
      setActive(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // Debounced fetch
  useEffect(() => {
    if (!open) return;
    if (query.trim().length < 2) {
      setHits([]);
      return;
    }
    const t = setTimeout(async () => {
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      setLoading(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`, {
          signal: ac.signal,
        });
        const json = (await res.json()) as { ok: boolean; data: SearchHit[] };
        if (!ac.signal.aborted) {
          setHits(json.data ?? []);
          setActive(0);
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") console.error(err);
      } finally {
        if (!ac.signal.aborted) setLoading(false);
      }
    }, 150);
    return () => clearTimeout(t);
  }, [query, open]);

  const pick = useCallback(
    (hit: SearchHit) => {
      router.push(hit.url);
      setOpen(false);
    },
    [router],
  );

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-24"
      onClick={(e) => {
        if (e.target === e.currentTarget) setOpen(false);
      }}
    >
      <div
        className="w-full max-w-xl overflow-hidden rounded-xl border border-[var(--color-border)] bg-white shadow-xl"
        role="dialog"
        aria-label="Búsqueda global"
      >
        <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-3">
          <Search size={16} className="text-[var(--color-muted)]" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((a) => Math.min(a + 1, hits.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => Math.max(a - 1, 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                const hit = hits[active];
                if (hit) pick(hit);
              }
            }}
            placeholder="Busca cajas, cables, clientes, CBL-0001:12…"
            className="h-12 flex-1 border-0 bg-transparent text-sm outline-none"
          />
          {loading ? (
            <span className="text-xs text-[var(--color-muted)]">Buscando…</span>
          ) : null}
          <kbd className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-1.5 py-0.5 text-[10px] font-mono">
            ESC
          </kbd>
        </div>
        <div className="max-h-96 overflow-auto">
          {hits.length === 0 && query.trim().length >= 2 && !loading ? (
            <div className="p-6 text-center text-sm text-[var(--color-muted)]">
              Sin coincidencias.
            </div>
          ) : null}
          {hits.length === 0 && query.trim().length < 2 ? (
            <div className="p-6 text-center text-sm text-[var(--color-muted)]">
              Escribe al menos 2 caracteres. Formato <span className="font-mono">cable:N</span> para
              saltar a una fibra concreta.
            </div>
          ) : null}
          <ul>
            {hits.map((h, i) => {
              const meta = KIND_META[h.kind];
              const isActive = i === active;
              return (
                <li key={`${h.kind}:${h.id}`}>
                  <button
                    type="button"
                    onClick={() => pick(h)}
                    onMouseEnter={() => setActive(i)}
                    className={`flex w-full items-center gap-3 px-3 py-2 text-left text-sm ${
                      isActive ? "bg-[var(--color-surface)]" : "hover:bg-[var(--color-surface)]/60"
                    }`}
                  >
                    <meta.Icon size={16} />
                    <span className="flex-1 truncate">
                      <span className="font-medium">{h.title}</span>
                      {h.subtitle ? (
                        <span className="ml-2 text-xs text-[var(--color-muted)]">{h.subtitle}</span>
                      ) : null}
                    </span>
                    <span className="rounded bg-[var(--color-surface)] px-1.5 py-0.5 text-[10px] uppercase text-[var(--color-muted)]">
                      {meta.label}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
        <div className="flex items-center justify-between border-t border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-[11px] text-[var(--color-muted)]">
          <span>
            <kbd className="font-mono">↑↓</kbd> navegar
            <span className="mx-2">·</span>
            <kbd className="font-mono">Enter</kbd> abrir
          </span>
          <span>
            <kbd className="font-mono">⌘K</kbd> cerrar
          </span>
        </div>
      </div>
    </div>
  );
}
