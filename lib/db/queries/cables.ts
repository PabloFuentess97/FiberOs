import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { cables, fibers, boxes, type CableType } from "@/lib/db/schema/network";

export interface CableListFilters {
  type?: CableType;
  cursor?: string;
  limit?: number;
}

export interface CableSummary {
  id: string;
  code: string;
  type: CableType;
  fiberCount: number;
  lengthM: string | null;
  sourceCode: string | null;
  targetCode: string | null;
  updatedAt: Date;
}

export async function listCables(
  organizationId: string,
  filters: CableListFilters = {},
): Promise<{ rows: CableSummary[]; nextCursor: string | null }> {
  const limit = Math.min(filters.limit ?? 50, 200);
  const srcBoxes = sql`src`;
  const tgtBoxes = sql`tgt`;

  const where = [eq(cables.organizationId, organizationId), isNull(cables.deletedAt)];
  if (filters.type) where.push(eq(cables.type, filters.type));
  if (filters.cursor) where.push(sql`${cables.updatedAt} < ${new Date(filters.cursor)}`);

  const rows = await db
    .select({
      id: cables.id,
      code: cables.code,
      type: cables.type,
      fiberCount: cables.fiberCount,
      lengthM: cables.lengthM,
      sourceCode: sql<string | null>`${srcBoxes}.code`,
      targetCode: sql<string | null>`${tgtBoxes}.code`,
      updatedAt: cables.updatedAt,
    })
    .from(cables)
    .leftJoin(sql`${boxes} ${srcBoxes}`, sql`${srcBoxes}.id = ${cables.sourceBoxId}`)
    .leftJoin(sql`${boxes} ${tgtBoxes}`, sql`${tgtBoxes}.id = ${cables.targetBoxId}`)
    .where(and(...where))
    .orderBy(desc(cables.updatedAt))
    .limit(limit + 1);

  const hasNext = rows.length > limit;
  const trimmed = hasNext ? rows.slice(0, limit) : rows;
  const nextCursor =
    hasNext && trimmed.length > 0 ? (trimmed[trimmed.length - 1]?.updatedAt.toISOString() ?? null) : null;
  return { rows: trimmed, nextCursor };
}

export async function listCablesForMap(organizationId: string) {
  const rows = await db
    .select({
      id: cables.id,
      code: cables.code,
      type: cables.type,
      pathGeoJson: sql<string | null>`ST_AsGeoJSON(${cables.path})::text`,
    })
    .from(cables)
    .where(
      and(
        eq(cables.organizationId, organizationId),
        isNull(cables.deletedAt),
        sql`${cables.path} IS NOT NULL`,
      ),
    );
  return rows;
}

export async function getCableById(organizationId: string, id: string) {
  const [cable] = await db
    .select({
      id: cables.id,
      code: cables.code,
      type: cables.type,
      standard: cables.standard,
      fiberCount: cables.fiberCount,
      lengthM: cables.lengthM,
      sourceBoxId: cables.sourceBoxId,
      targetBoxId: cables.targetBoxId,
      notes: cables.notes,
      installedAt: cables.installedAt,
      createdAt: cables.createdAt,
      updatedAt: cables.updatedAt,
      pathGeoJson: sql<string | null>`ST_AsGeoJSON(${cables.path})::text`,
    })
    .from(cables)
    .where(and(eq(cables.organizationId, organizationId), eq(cables.id, id), isNull(cables.deletedAt)))
    .limit(1);

  if (!cable) return null;

  const fiberRows = await db
    .select()
    .from(fibers)
    .where(eq(fibers.cableId, id))
    .orderBy(fibers.number);

  return { ...cable, fibers: fiberRows };
}
