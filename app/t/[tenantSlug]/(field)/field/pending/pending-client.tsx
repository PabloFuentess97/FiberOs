"use client";

import { useEffect, useState } from "react";
import { RefreshCw, AlertTriangle, XCircle, Trash2 } from "lucide-react";
import { fieldDB, type PendingMutation } from "@/lib/field/db";
import { flushPending, retryConflict, discardMutation } from "@/lib/field/sync";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const STATUS_TONE: Record<PendingMutation["status"], "warning" | "destructive" | "neutral" | "info" | "success"> = {
  pending: "warning",
  syncing: "info",
  applied: "success",
  conflict: "destructive",
  rejected: "destructive",
};

export function PendingClient() {
  const [rows, setRows] = useState<PendingMutation[]>([]);
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);

  async function refresh() {
    const db = fieldDB();
    setRows(await db.pendingMutations.orderBy("createdAt").reverse().toArray());
  }

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 2000);
    return () => clearInterval(id);
  }, []);

  async function onFlush() {
    setBusy(true);
    try {
      const r = await flushPending();
      setSummary(
        `Aplicadas: ${r.applied} · Conflictos: ${r.conflicts} · Rechazadas: ${r.rejected}`,
      );
      await refresh();
    } catch (err) {
      setSummary(err instanceof Error ? err.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  async function onRetry(clientUuid: string) {
    await retryConflict(clientUuid, true);
    await refresh();
  }

  async function onDiscard(clientUuid: string) {
    if (!confirm("¿Descartar esta mutación sin enviarla?")) return;
    await discardMutation(clientUuid);
    await refresh();
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm text-[var(--color-muted)]">{rows.length} en cola</span>
        <Button onClick={onFlush} disabled={busy} size="sm">
          <RefreshCw size={14} /> {busy ? "Sincronizando…" : "Sincronizar ahora"}
        </Button>
      </div>
      {summary ? (
        <div className="mb-3 rounded-md bg-[var(--color-surface)] px-3 py-2 text-xs">{summary}</div>
      ) : null}

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[var(--color-border)] p-10 text-center text-sm text-[var(--color-muted)]">
          No hay mutaciones pendientes. Todo al día.
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((m) => (
            <li
              key={m.clientUuid}
              className="rounded-lg border border-[var(--color-border)] bg-white p-3 text-sm"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge tone={STATUS_TONE[m.status]}>{m.status}</Badge>
                  <span className="font-mono text-xs">
                    {m.entity}/{m.op}
                  </span>
                  <span className="text-xs text-[var(--color-muted)]">
                    {new Date(m.createdAt).toLocaleTimeString("es-ES")}
                  </span>
                </div>
                <span className="text-xs text-[var(--color-muted)]">
                  {m.attempts > 0 ? `${m.attempts} intento${m.attempts > 1 ? "s" : ""}` : ""}
                </span>
              </div>
              {m.lastError ? (
                <p className="mt-1 flex items-start gap-1 text-xs text-[var(--color-destructive)]">
                  <AlertTriangle size={12} className="mt-0.5" />
                  {m.lastError}
                </p>
              ) : null}
              {m.status === "conflict" ? (
                <div className="mt-2 flex gap-2">
                  <Button size="sm" onClick={() => onRetry(m.clientUuid)}>
                    Forzar (descarta versión local)
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => onDiscard(m.clientUuid)}>
                    <Trash2 size={12} /> Descartar
                  </Button>
                </div>
              ) : m.status === "rejected" ? (
                <div className="mt-2">
                  <Button size="sm" variant="outline" onClick={() => onDiscard(m.clientUuid)}>
                    <XCircle size={12} /> Quitar de la cola
                  </Button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
