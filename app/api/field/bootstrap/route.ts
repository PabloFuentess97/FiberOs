import { NextResponse } from "next/server";
import { and, eq, isNull, or, sql } from "drizzle-orm";
import { requireTenantContext } from "@/lib/tenancy/guards";
import { withTenantTx } from "@/lib/tenancy/context";
import { boxes, cables, fibers } from "@/lib/db/schema/network";
import { splitters, splitterPorts } from "@/lib/db/schema/fusion";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Devuelve un snapshot para hidratar IndexedDB del técnico de campo.
 * Opcionalmente filtra por bbox `?bbox=minLng,minLat,maxLng,maxLat`.
 * Sin bbox → toda la organización (para dispositivos de oficina).
 */
export async function GET(req: Request) {
  const ctx = await requireTenantContext();
  if (!ctx) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const bbox = url.searchParams.get("bbox");
  let bboxFilter: ReturnType<typeof sql> | null = null;
  if (bbox) {
    const parts = bbox.split(",").map(Number);
    if (parts.length === 4 && parts.every((n) => Number.isFinite(n))) {
      const [minLng, minLat, maxLng, maxLat] = parts as [number, number, number, number];
      bboxFilter = sql`ST_Intersects(location::geometry, ST_MakeEnvelope(${minLng}, ${minLat}, ${maxLng}, ${maxLat}, 4326))`;
    }
  }

  const data = await withTenantTx(
    { userId: ctx.userId, organizationId: ctx.organizationId, impersonatedBy: ctx.impersonatedBy },
    async (tx) => {
      const boxRows = await tx
        .select({
          id: boxes.id,
          code: boxes.code,
          shortId: boxes.shortId,
          type: boxes.type,
          status: boxes.status,
          address: boxes.address,
          version: boxes.version,
          updatedAt: boxes.updatedAt,
          lng: sql<number>`ST_X(${boxes.location}::geometry)`,
          lat: sql<number>`ST_Y(${boxes.location}::geometry)`,
        })
        .from(boxes)
        .where(
          and(
            eq(boxes.organizationId, ctx.organizationId),
            isNull(boxes.deletedAt),
            bboxFilter ?? sql`true`,
          ),
        );

      const boxIds = boxRows.map((b) => b.id);
      if (boxIds.length === 0) {
        return { boxes: [], cables: [], fibers: [], splitters: [], splitterPorts: [] };
      }

      const cableRows = await tx
        .select({
          id: cables.id,
          code: cables.code,
          type: cables.type,
          fiberCount: cables.fiberCount,
          sourceBoxId: cables.sourceBoxId,
          targetBoxId: cables.targetBoxId,
          updatedAt: cables.updatedAt,
        })
        .from(cables)
        .where(
          and(
            eq(cables.organizationId, ctx.organizationId),
            isNull(cables.deletedAt),
            or(
              sql`${cables.sourceBoxId} IN ${boxIds}`,
              sql`${cables.targetBoxId} IN ${boxIds}`,
            )!,
          ),
        );

      const cableIds = cableRows.map((c) => c.id);
      const fiberRows = cableIds.length === 0 ? [] : await tx
        .select()
        .from(fibers)
        .where(sql`${fibers.cableId} IN ${cableIds}`);

      const splitterRows = await tx
        .select({
          id: splitters.id,
          boxId: splitters.boxId,
          code: splitters.code,
          ratio: splitters.ratio,
        })
        .from(splitters)
        .where(sql`${splitters.boxId} IN ${boxIds}`);

      const splitterIds = splitterRows.map((s) => s.id);
      const portRows = splitterIds.length === 0 ? [] : await tx
        .select()
        .from(splitterPorts)
        .where(sql`${splitterPorts.splitterId} IN ${splitterIds}`);

      return {
        boxes: boxRows.map((b) => ({ ...b, updatedAt: b.updatedAt.getTime() })),
        cables: cableRows.map((c) => ({ ...c, updatedAt: c.updatedAt.getTime() })),
        fibers: fiberRows,
        splitters: splitterRows,
        splitterPorts: portRows,
      };
    },
  );

  return NextResponse.json({
    ok: true,
    data: { ...data, serverTime: Date.now() },
  });
}
