"use client";

import Dexie, { type Table } from "dexie";
import type { FiberColor, FiberStatus } from "@/lib/db/schema/network";

// ============ Tipos de las colecciones locales ============
export interface FieldBox {
  id: string;
  code: string;
  shortId: string;
  type: string;
  status: string;
  lat: number;
  lng: number;
  address: string | null;
  version: number;
  updatedAt: number; // epoch ms
}

export interface FieldCable {
  id: string;
  code: string;
  type: string;
  fiberCount: number;
  sourceBoxId: string | null;
  targetBoxId: string | null;
  updatedAt: number;
}

export interface FieldFiber {
  id: string;
  cableId: string;
  number: number;
  color: FiberColor;
  status: FiberStatus;
}

export interface FieldSplitterPort {
  id: string;
  splitterId: string;
  kind: "input" | "output";
  portNumber: number;
  fused: boolean;
}

export interface FieldSplitter {
  id: string;
  boxId: string;
  code: string;
  ratio: string;
}

export interface FieldFusion {
  id: string;
  boxId: string;
  endpointAKind: "fiber" | "splitter_port";
  endpointAId: string;
  endpointBKind: "fiber" | "splitter_port";
  endpointBId: string;
  lossDb: number | null;
  fusedAt: number;
  version: number;
}

export type PendingMutationEntity = "fusion" | "box" | "client";
export type PendingMutationOp = "create" | "update" | "delete";
export type PendingMutationStatus = "pending" | "syncing" | "applied" | "conflict" | "rejected";

export interface PendingMutation {
  clientUuid: string;
  entity: PendingMutationEntity;
  op: PendingMutationOp;
  // Versión del entity que el cliente vio al editar (null en create)
  clientVersion: number | null;
  payload: unknown;
  createdAt: number;
  attempts: number;
  status: PendingMutationStatus;
  lastError?: string;
  // En conflict, el estado del servidor para revisar
  serverState?: unknown;
  serverVersion?: number;
  appliedServerId?: string;
}

export interface DeviceMeta {
  key: "deviceId" | "lastBootstrapAt" | "tenantSlug";
  value: string;
}

// ============ Dexie database ============
class FieldDB extends Dexie {
  boxes!: Table<FieldBox, string>;
  cables!: Table<FieldCable, string>;
  fibers!: Table<FieldFiber, string>;
  splitters!: Table<FieldSplitter, string>;
  splitterPorts!: Table<FieldSplitterPort, string>;
  fusions!: Table<FieldFusion, string>;
  pendingMutations!: Table<PendingMutation, string>;
  meta!: Table<DeviceMeta, string>;

  constructor() {
    super("fibraos-field");
    this.version(1).stores({
      boxes: "id, code, shortId, type, updatedAt",
      cables: "id, code, sourceBoxId, targetBoxId, updatedAt",
      fibers: "id, cableId, [cableId+number]",
      splitters: "id, boxId, code",
      splitterPorts: "id, splitterId, [splitterId+kind+portNumber]",
      fusions: "id, boxId, fusedAt",
      pendingMutations: "clientUuid, status, createdAt",
      meta: "key",
    });
  }
}

// Lazy singleton — evita errores de "already open" y no se evalúa en SSR
let _db: FieldDB | null = null;
export function fieldDB(): FieldDB {
  if (typeof window === "undefined") {
    throw new Error("fieldDB() solo se puede usar en el cliente");
  }
  if (!_db) _db = new FieldDB();
  return _db;
}

// ============ Helpers ============
export async function getOrCreateDeviceId(): Promise<string> {
  const db = fieldDB();
  const row = await db.meta.get("deviceId");
  if (row) return row.value;
  const newId = crypto.randomUUID();
  await db.meta.put({ key: "deviceId", value: newId });
  return newId;
}

export async function countPending(): Promise<number> {
  const db = fieldDB();
  return db.pendingMutations.where("status").anyOf("pending", "conflict").count();
}

export async function enqueue(m: Omit<PendingMutation, "createdAt" | "attempts" | "status" | "clientUuid"> & { clientUuid?: string }): Promise<string> {
  const db = fieldDB();
  const clientUuid = m.clientUuid ?? crypto.randomUUID();
  await db.pendingMutations.put({
    ...m,
    clientUuid,
    createdAt: Date.now(),
    attempts: 0,
    status: "pending",
  });
  return clientUuid;
}
