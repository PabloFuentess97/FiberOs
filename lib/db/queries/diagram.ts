import { and, eq, isNull, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { boxes, cables, fibers, trays, type FiberColor, type FiberStatus } from "@/lib/db/schema/network";
import {
  fusionEndpoints,
  fusions,
  splitterPorts,
  splitters,
  type SplitterRatio,
} from "@/lib/db/schema/fusion";

export interface TrayDTO {
  id: string;
  number: number;
  capacity: number;
}

export interface SplitterPortDTO {
  id: string;
  kind: "input" | "output";
  portNumber: number;
  fusedTo: { kind: "fiber" | "splitter_port"; id: string; fusionId: string } | null;
}

export interface SplitterDTO {
  id: string;
  code: string;
  ratio: SplitterRatio;
  trayId: string | null;
  position: number | null;
  ports: SplitterPortDTO[];
}

export interface CableEndDTO {
  cableId: string;
  cableCode: string;
  direction: "in" | "out"; // respecto a la caja
  fibers: Array<{
    id: string;
    number: number;
    color: FiberColor;
    status: FiberStatus;
    fusedTo: { kind: "fiber" | "splitter_port"; id: string; fusionId: string } | null;
  }>;
}

export interface FusionDTO {
  id: string;
  trayId: string | null;
  position: number | null;
  lossDb: string | null;
  notes: string | null;
  fusedAt: Date;
  endpointA: { kind: "fiber" | "splitter_port"; id: string };
  endpointB: { kind: "fiber" | "splitter_port"; id: string };
}

export interface InternalDiagramDTO {
  boxId: string;
  trays: TrayDTO[];
  splitters: SplitterDTO[];
  cableEnds: CableEndDTO[];
  fusions: FusionDTO[];
}

export async function getInternalDiagram(
  organizationId: string,
  boxId: string,
): Promise<InternalDiagramDTO | null> {
  const [box] = await db
    .select({ id: boxes.id })
    .from(boxes)
    .where(and(eq(boxes.organizationId, organizationId), eq(boxes.id, boxId), isNull(boxes.deletedAt)))
    .limit(1);
  if (!box) return null;

  const trayRows = await db
    .select({ id: trays.id, number: trays.number, capacity: trays.capacity })
    .from(trays)
    .where(eq(trays.boxId, boxId))
    .orderBy(trays.number);

  // Splitters + puertos + fusiones de puertos
  const splitterRows = await db
    .select({
      id: splitters.id,
      code: splitters.code,
      ratio: splitters.ratio,
      trayId: splitters.trayId,
      position: splitters.position,
    })
    .from(splitters)
    .where(and(eq(splitters.organizationId, organizationId), eq(splitters.boxId, boxId)))
    .orderBy(splitters.code);

  const portRows =
    splitterRows.length === 0
      ? []
      : await db
          .select({
            id: splitterPorts.id,
            splitterId: splitterPorts.splitterId,
            kind: splitterPorts.kind,
            portNumber: splitterPorts.portNumber,
          })
          .from(splitterPorts)
          .where(
            and(
              eq(splitterPorts.organizationId, organizationId),
              sql`${splitterPorts.splitterId} IN ${splitterRows.map((s) => s.id)}`,
            ),
          )
          .orderBy(splitterPorts.kind, splitterPorts.portNumber);

  // Cables cuya source o target es esta caja
  const cableRows = await db
    .select({
      id: cables.id,
      code: cables.code,
      sourceBoxId: cables.sourceBoxId,
      targetBoxId: cables.targetBoxId,
    })
    .from(cables)
    .where(
      and(
        eq(cables.organizationId, organizationId),
        isNull(cables.deletedAt),
        or(eq(cables.sourceBoxId, boxId), eq(cables.targetBoxId, boxId))!,
      ),
    )
    .orderBy(cables.code);

  const fiberRows =
    cableRows.length === 0
      ? []
      : await db
          .select({
            id: fibers.id,
            cableId: fibers.cableId,
            number: fibers.number,
            color: fibers.color,
            status: fibers.status,
          })
          .from(fibers)
          .where(sql`${fibers.cableId} IN ${cableRows.map((c) => c.id)}`)
          .orderBy(fibers.cableId, fibers.number);

  // Fusions de esta caja + endpoints
  const fusionRows = await db
    .select()
    .from(fusions)
    .where(and(eq(fusions.organizationId, organizationId), eq(fusions.boxId, boxId)))
    .orderBy(fusions.fusedAt);

  const endpointRows =
    fusionRows.length === 0
      ? []
      : await db
          .select()
          .from(fusionEndpoints)
          .where(sql`${fusionEndpoints.fusionId} IN ${fusionRows.map((f) => f.id)}`);

  // Mapear endpoints por (kind, id) para resolver conexiones rápidamente
  const fusedBy = new Map<string, { fusionId: string; otherKind: "fiber" | "splitter_port"; otherId: string }>();
  for (const f of fusionRows) {
    const pairs: Array<{ kind: "fiber" | "splitter_port"; id: string | null }> = [
      {
        kind: f.endpointAKind as "fiber" | "splitter_port",
        id: f.endpointAFiberId ?? f.endpointASplitterPortId,
      },
      {
        kind: f.endpointBKind as "fiber" | "splitter_port",
        id: f.endpointBFiberId ?? f.endpointBSplitterPortId,
      },
    ];
    if (!pairs[0]?.id || !pairs[1]?.id) continue;
    fusedBy.set(`${pairs[0].kind}:${pairs[0].id}`, {
      fusionId: f.id,
      otherKind: pairs[1].kind,
      otherId: pairs[1].id,
    });
    fusedBy.set(`${pairs[1].kind}:${pairs[1].id}`, {
      fusionId: f.id,
      otherKind: pairs[0].kind,
      otherId: pairs[0].id,
    });
  }

  const splitterDTOs: SplitterDTO[] = splitterRows.map((s) => ({
    id: s.id,
    code: s.code,
    ratio: s.ratio,
    trayId: s.trayId,
    position: s.position,
    ports: portRows
      .filter((p) => p.splitterId === s.id)
      .map<SplitterPortDTO>((p) => {
        const hit = fusedBy.get(`splitter_port:${p.id}`);
        return {
          id: p.id,
          kind: p.kind,
          portNumber: p.portNumber,
          fusedTo: hit
            ? { kind: hit.otherKind, id: hit.otherId, fusionId: hit.fusionId }
            : null,
        };
      }),
  }));

  const cableEndDTOs: CableEndDTO[] = cableRows.map((c) => ({
    cableId: c.id,
    cableCode: c.code,
    direction: c.sourceBoxId === boxId ? "out" : "in",
    fibers: fiberRows
      .filter((f) => f.cableId === c.id)
      .map((f) => {
        const hit = fusedBy.get(`fiber:${f.id}`);
        return {
          id: f.id,
          number: f.number,
          color: f.color,
          status: f.status,
          fusedTo: hit ? { kind: hit.otherKind, id: hit.otherId, fusionId: hit.fusionId } : null,
        };
      }),
  }));

  const fusionDTOs: FusionDTO[] = fusionRows.map((f) => ({
    id: f.id,
    trayId: f.trayId,
    position: f.position,
    lossDb: f.lossDb,
    notes: f.notes,
    fusedAt: f.fusedAt,
    endpointA: {
      kind: f.endpointAKind as "fiber" | "splitter_port",
      id: (f.endpointAFiberId ?? f.endpointASplitterPortId)!,
    },
    endpointB: {
      kind: f.endpointBKind as "fiber" | "splitter_port",
      id: (f.endpointBFiberId ?? f.endpointBSplitterPortId)!,
    },
  }));

  return {
    boxId,
    trays: trayRows,
    splitters: splitterDTOs,
    cableEnds: cableEndDTOs,
    fusions: fusionDTOs,
  };
}
