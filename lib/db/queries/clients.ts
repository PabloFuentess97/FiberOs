import { and, desc, eq, ilike, isNull, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { clients, type ClientStatus } from "@/lib/db/schema/clients";
import { fibers, cables, boxes } from "@/lib/db/schema/network";

export interface ClientListFilters {
  search?: string;
  status?: ClientStatus;
  cursor?: string;
  limit?: number;
}

export interface ClientSummary {
  id: string;
  externalCode: string | null;
  name: string;
  address: string;
  phone: string | null;
  status: ClientStatus;
  ontSerial: string | null;
  dropFiberCableCode: string | null;
  updatedAt: Date;
}

export async function listClients(
  organizationId: string,
  filters: ClientListFilters = {},
): Promise<{ rows: ClientSummary[]; nextCursor: string | null }> {
  const limit = Math.min(filters.limit ?? 50, 200);

  const where = [eq(clients.organizationId, organizationId), isNull(clients.deletedAt)];
  if (filters.status) where.push(eq(clients.status, filters.status));
  if (filters.search) {
    const like = `%${filters.search}%`;
    where.push(
      or(
        ilike(clients.name, like),
        ilike(clients.externalCode, like),
        ilike(clients.address, like),
        ilike(clients.phone, like),
      )!,
    );
  }
  if (filters.cursor) where.push(sql`${clients.updatedAt} < ${new Date(filters.cursor)}`);

  const rows = await db
    .select({
      id: clients.id,
      externalCode: clients.externalCode,
      name: clients.name,
      address: clients.address,
      phone: clients.phone,
      status: clients.status,
      ontSerial: clients.ontSerial,
      dropFiberCableCode: sql<string | null>`(
        SELECT ${cables.code} FROM ${cables}
        INNER JOIN ${fibers} ON ${fibers.cableId} = ${cables.id}
        WHERE ${fibers.id} = ${clients.dropFiberId}
      )`,
      updatedAt: clients.updatedAt,
    })
    .from(clients)
    .where(and(...where))
    .orderBy(desc(clients.updatedAt))
    .limit(limit + 1);

  const hasNext = rows.length > limit;
  const trimmed = hasNext ? rows.slice(0, limit) : rows;
  const nextCursor =
    hasNext && trimmed.length > 0
      ? (trimmed[trimmed.length - 1]?.updatedAt.toISOString() ?? null)
      : null;
  return { rows: trimmed, nextCursor };
}

export async function getClientById(organizationId: string, id: string) {
  const [row] = await db
    .select({
      id: clients.id,
      externalCode: clients.externalCode,
      name: clients.name,
      documentId: clients.documentId,
      phone: clients.phone,
      email: clients.email,
      address: clients.address,
      ontSerial: clients.ontSerial,
      ontModel: clients.ontModel,
      status: clients.status,
      installedAt: clients.installedAt,
      notes: clients.notes,
      dropFiberId: clients.dropFiberId,
      dropFiberNumber: fibers.number,
      dropCableCode: cables.code,
      dropCableId: cables.id,
      dropBoxCode: boxes.code,
      lat: sql<number | null>`ST_Y(${clients.location}::geometry)`,
      lng: sql<number | null>`ST_X(${clients.location}::geometry)`,
      version: clients.version,
      updatedAt: clients.updatedAt,
    })
    .from(clients)
    .leftJoin(fibers, eq(fibers.id, clients.dropFiberId))
    .leftJoin(cables, eq(cables.id, fibers.cableId))
    .leftJoin(boxes, eq(boxes.id, cables.targetBoxId))
    .where(
      and(eq(clients.organizationId, organizationId), eq(clients.id, id), isNull(clients.deletedAt)),
    )
    .limit(1);
  return row ?? null;
}

/** Clientes con location válido, agregados para render en mapa. */
export async function listClientsForMap(organizationId: string) {
  return db
    .select({
      id: clients.id,
      name: clients.name,
      status: clients.status,
      lng: sql<number>`ST_X(${clients.location}::geometry)`,
      lat: sql<number>`ST_Y(${clients.location}::geometry)`,
    })
    .from(clients)
    .where(
      and(
        eq(clients.organizationId, organizationId),
        isNull(clients.deletedAt),
        sql`${clients.location} IS NOT NULL`,
      ),
    );
}
