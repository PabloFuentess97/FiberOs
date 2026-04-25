"use client";

import { fieldDB } from "./db";

interface BootstrapResponse {
  ok: boolean;
  data?: {
    boxes: Array<{
      id: string;
      code: string;
      shortId: string;
      type: string;
      status: string;
      address: string | null;
      version: number;
      updatedAt: number;
      lat: number;
      lng: number;
    }>;
    cables: Array<{
      id: string;
      code: string;
      type: string;
      fiberCount: number;
      sourceBoxId: string | null;
      targetBoxId: string | null;
      updatedAt: number;
    }>;
    fibers: Array<{
      id: string;
      cableId: string;
      number: number;
      color: string;
      status: string;
    }>;
    splitters: Array<{ id: string; boxId: string; code: string; ratio: string }>;
    splitterPorts: Array<{
      id: string;
      splitterId: string;
      kind: "input" | "output";
      portNumber: number;
    }>;
    serverTime: number;
  };
}

/**
 * Descarga snapshot y lo vuelca a Dexie. Sin bbox → toda la org.
 * Con bbox → un radio alrededor del GPS del usuario.
 */
export async function bootstrapField(bbox?: [number, number, number, number]): Promise<number> {
  const url = bbox ? `/api/field/bootstrap?bbox=${bbox.join(",")}` : "/api/field/bootstrap";
  const res = await fetch(url, { cache: "no-store" });
  const json = (await res.json()) as BootstrapResponse;
  if (!json.ok || !json.data) throw new Error("bootstrap_failed");

  const db = fieldDB();
  await db.transaction(
    "rw",
    [db.boxes, db.cables, db.fibers, db.splitters, db.splitterPorts, db.meta],
    async () => {
      await Promise.all([
        db.boxes.clear(),
        db.cables.clear(),
        db.fibers.clear(),
        db.splitters.clear(),
        db.splitterPorts.clear(),
      ]);
      await db.boxes.bulkAdd(json.data!.boxes);
      await db.cables.bulkAdd(json.data!.cables);
      await db.fibers.bulkAdd(json.data!.fibers.map((f) => ({ ...f, color: f.color as never, status: f.status as never })));
      await db.splitters.bulkAdd(json.data!.splitters);
      await db.splitterPorts.bulkAdd(
        json.data!.splitterPorts.map((p) => ({ ...p, fused: false })),
      );
      await db.meta.put({ key: "lastBootstrapAt", value: String(json.data!.serverTime) });
    },
  );
  return json.data.boxes.length;
}

/** ¿Hay datos locales utilizables? */
export async function hasLocalData(): Promise<boolean> {
  const db = fieldDB();
  const count = await db.boxes.count();
  return count > 0;
}
