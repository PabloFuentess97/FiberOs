"use client";

import { fieldDB, getOrCreateDeviceId, type PendingMutation } from "./db";

interface SyncResponseItem {
  clientUuid: string;
  status: "applied" | "noop" | "conflict" | "rejected";
  serverId?: string;
  serverVersion?: number;
  serverState?: unknown;
  error?: string;
}

interface SyncResponse {
  ok: boolean;
  data?: { results: SyncResponseItem[]; serverTime: number };
  error?: string;
}

const BATCH = 50;

/**
 * Flush de la cola de mutaciones pendientes contra `/api/field/sync`.
 * Resiliente a red: si falla el fetch entero, deja todo en `pending` para
 * el próximo intento. Aplica resultados item-por-item.
 */
export async function flushPending(): Promise<{
  applied: number;
  conflicts: number;
  rejected: number;
  remaining: number;
}> {
  const db = fieldDB();
  const deviceId = await getOrCreateDeviceId();

  const pending = await db.pendingMutations
    .where("status")
    .anyOf("pending")
    .sortBy("createdAt");

  if (pending.length === 0) {
    const remaining = await db.pendingMutations.where("status").anyOf("conflict").count();
    return { applied: 0, conflicts: 0, rejected: 0, remaining };
  }

  let applied = 0;
  let conflicts = 0;
  let rejected = 0;

  for (let i = 0; i < pending.length; i += BATCH) {
    const batch = pending.slice(i, i + BATCH);
    // Marcar syncing para UX
    await db.pendingMutations.bulkPut(batch.map((m) => ({ ...m, status: "syncing" as const })));

    try {
      const res = await fetch("/api/field/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deviceId,
          mutations: batch.map((m) => ({
            clientUuid: m.clientUuid,
            entity: m.entity,
            op: m.op,
            clientVersion: m.clientVersion,
            payload: m.payload,
          })),
        }),
      });
      const json = (await res.json()) as SyncResponse;
      if (!json.ok || !json.data) throw new Error(json.error ?? "sync_error");

      for (const r of json.data.results) {
        const existing = await db.pendingMutations.get(r.clientUuid);
        if (!existing) continue;

        if (r.status === "applied" || r.status === "noop") {
          applied++;
          // Limpieza: borramos de la cola cuando se confirma
          await db.pendingMutations.delete(r.clientUuid);
        } else if (r.status === "conflict") {
          conflicts++;
          await db.pendingMutations.put({
            ...existing,
            status: "conflict",
            serverVersion: r.serverVersion,
            serverState: r.serverState,
            lastError: "version_mismatch",
          });
        } else {
          rejected++;
          await db.pendingMutations.put({
            ...existing,
            status: "rejected",
            lastError: r.error ?? "rejected",
          });
        }
      }
    } catch (err) {
      // Red caída o 5xx → volver a pending con attempts++
      await db.pendingMutations.bulkPut(
        batch.map((m) => ({
          ...m,
          status: "pending" as const,
          attempts: m.attempts + 1,
          lastError: err instanceof Error ? err.message : String(err),
        })),
      );
      break; // no insistas contra un servidor muerto
    }
  }

  const remaining = await db.pendingMutations
    .where("status")
    .anyOf("pending", "conflict")
    .count();
  return { applied, conflicts, rejected, remaining };
}

/** Marca una mutación en conflict como "retry" (el usuario decidió forzar). */
export async function retryConflict(clientUuid: string, forceNoVersion = true): Promise<void> {
  const db = fieldDB();
  const m = await db.pendingMutations.get(clientUuid);
  if (!m) return;
  await db.pendingMutations.put({
    ...m,
    status: "pending",
    clientVersion: forceNoVersion ? null : m.clientVersion,
    serverState: undefined,
    serverVersion: undefined,
    lastError: undefined,
  });
}

/** Descarta una mutación (el usuario decidió no aplicarla). */
export async function discardMutation(clientUuid: string): Promise<void> {
  const db = fieldDB();
  await db.pendingMutations.delete(clientUuid);
}

export type { PendingMutation };
