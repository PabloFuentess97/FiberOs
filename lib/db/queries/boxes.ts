import { and, asc, count, desc, eq, ilike, isNull, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { boxes, type BoxType, type BoxStatus } from "@/lib/db/schema/network";

export interface BoxListFilters {
  search?: string;
  type?: BoxType;
  status?: BoxStatus;
  cursor?: string;
  limit?: number;
}

export interface BoxSummary {
  id: string;
  code: string;
  shortId: string;
  type: BoxType;
  status: BoxStatus;
  address: string | null;
  lat: number;
  lng: number;
  updatedAt: Date;
}

/**
 * Lista cajas del tenant actual. Requiere `SET LOCAL app.organization_id`
 * ya aplicado (o filtro explícito adicional). La query usa ST_AsGeoJSON
 * para serializar el punto.
 */
export async function listBoxes(
  organizationId: string,
  filters: BoxListFilters = {},
): Promise<{ rows: BoxSummary[]; nextCursor: string | null }> {
  const limit = Math.min(filters.limit ?? 50, 200);

  const where = [eq(boxes.organizationId, organizationId), isNull(boxes.deletedAt)];
  if (filters.type) where.push(eq(boxes.type, filters.type));
  if (filters.status) where.push(eq(boxes.status, filters.status));
  if (filters.search) {
    const like = `%${filters.search}%`;
    where.push(
      or(ilike(boxes.code, like), ilike(boxes.address, like), ilike(boxes.notes, like))!,
    );
  }
  if (filters.cursor) {
    where.push(sql`${boxes.updatedAt} < ${new Date(filters.cursor)}`);
  }

  const rows = await db
    .select({
      id: boxes.id,
      code: boxes.code,
      shortId: boxes.shortId,
      type: boxes.type,
      status: boxes.status,
      address: boxes.address,
      lng: sql<number>`ST_X(${boxes.location}::geometry)`,
      lat: sql<number>`ST_Y(${boxes.location}::geometry)`,
      updatedAt: boxes.updatedAt,
    })
    .from(boxes)
    .where(and(...where))
    .orderBy(desc(boxes.updatedAt))
    .limit(limit + 1);

  const hasNext = rows.length > limit;
  const trimmed = hasNext ? rows.slice(0, limit) : rows;
  const nextCursor =
    hasNext && trimmed.length > 0 ? (trimmed[trimmed.length - 1]?.updatedAt.toISOString() ?? null) : null;

  return { rows: trimmed, nextCursor };
}

export async function countBoxes(organizationId: string): Promise<number> {
  const [row] = await db
    .select({ count: count() })
    .from(boxes)
    .where(and(eq(boxes.organizationId, organizationId), isNull(boxes.deletedAt)));
  return row?.count ?? 0;
}

export async function getBoxById(organizationId: string, id: string) {
  const [row] = await db
    .select({
      id: boxes.id,
      code: boxes.code,
      shortId: boxes.shortId,
      type: boxes.type,
      status: boxes.status,
      manufacturer: boxes.manufacturer,
      model: boxes.model,
      positionsPerTray: boxes.positionsPerTray,
      address: boxes.address,
      notes: boxes.notes,
      installedAt: boxes.installedAt,
      version: boxes.version,
      createdAt: boxes.createdAt,
      updatedAt: boxes.updatedAt,
      lng: sql<number>`ST_X(${boxes.location}::geometry)`,
      lat: sql<number>`ST_Y(${boxes.location}::geometry)`,
    })
    .from(boxes)
    .where(and(eq(boxes.organizationId, organizationId), eq(boxes.id, id), isNull(boxes.deletedAt)))
    .limit(1);
  return row ?? null;
}

export async function listBoxesForMap(organizationId: string): Promise<BoxSummary[]> {
  const rows = await db
    .select({
      id: boxes.id,
      code: boxes.code,
      shortId: boxes.shortId,
      type: boxes.type,
      status: boxes.status,
      address: boxes.address,
      lng: sql<number>`ST_X(${boxes.location}::geometry)`,
      lat: sql<number>`ST_Y(${boxes.location}::geometry)`,
      updatedAt: boxes.updatedAt,
    })
    .from(boxes)
    .where(and(eq(boxes.organizationId, organizationId), isNull(boxes.deletedAt)))
    .orderBy(asc(boxes.type));
  return rows;
}
