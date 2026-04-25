import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq, sql } from "drizzle-orm";
import { requireTenantContext } from "@/lib/tenancy/guards";
import { withTenantTx } from "@/lib/tenancy/context";
import { boxes } from "@/lib/db/schema/network";
import { fusions } from "@/lib/db/schema/fusion";
import { clients } from "@/lib/db/schema/clients";
import { fieldSyncQueue } from "@/lib/db/schema/field";
import { canFuse, type CanFuseEndpoint } from "@/lib/network/fusion";
import { logger } from "@/lib/observability/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const endpointRefSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("fiber"), id: z.string().uuid() }),
  z.object({ kind: z.literal("splitter_port"), id: z.string().uuid() }),
]);

const mutationSchema = z.object({
  clientUuid: z.string().uuid(),
  entity: z.enum(["fusion", "box", "client"]),
  op: z.enum(["create", "update", "delete"]),
  clientVersion: z.number().int().nullable(),
  payload: z.record(z.string(), z.unknown()),
});

const syncSchema = z.object({
  deviceId: z.string().min(4),
  mutations: z.array(mutationSchema).max(50),
});

type SyncResult =
  | { clientUuid: string; status: "applied"; serverId: string }
  | { clientUuid: string; status: "noop"; serverId?: string } // ya aplicado (reintento)
  | { clientUuid: string; status: "conflict"; serverVersion: number; serverState: unknown }
  | { clientUuid: string; status: "rejected"; error: string };

/**
 * Aplica un lote de mutaciones offline (hasta 50). Cada mutación se procesa
 * atómicamente. Ante `clientVersion != serverVersion` → status=conflict y
 * se archiva en `field_sync_queue` para revisión. En reintentos idempotentes
 * (mismo `device_id + client_uuid`) devuelve `noop` sin duplicar.
 *
 * LWW: cuando no hay conflicto, `updated_by = userId`, `updated_at = now()`,
 * `version += 1` (trigger).
 */
export async function POST(req: Request) {
  const ctx = await requireTenantContext();
  if (!ctx) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (!["admin", "manager", "technician"].includes(ctx.role)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const parsed = syncSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "validation_error" }, { status: 400 });
  }

  const { deviceId, mutations } = parsed.data;
  const results: SyncResult[] = [];

  for (const m of mutations) {
    try {
      const res = await withTenantTx(
        { userId: ctx.userId, organizationId: ctx.organizationId, impersonatedBy: ctx.impersonatedBy },
        async (tx) => {
          // Idempotencia: si ya procesamos este (deviceId, clientUuid) → devolver estado previo
          const [prev] = await tx
            .select()
            .from(fieldSyncQueue)
            .where(
              and(
                eq(fieldSyncQueue.deviceId, deviceId),
                eq(fieldSyncQueue.clientUuid, m.clientUuid),
              ),
            )
            .limit(1);

          if (prev) {
            if (prev.status === "applied") {
              return {
                clientUuid: m.clientUuid,
                status: "noop" as const,
                serverId: prev.appliedRecordId ?? undefined,
              };
            }
            if (prev.status === "rejected") {
              return {
                clientUuid: m.clientUuid,
                status: "rejected" as const,
                error: prev.error ?? "rejected",
              };
            }
            // Si estaba en conflict o pending y ahora lo reintentan → dejamos caer al flujo normal
          }

          const applied = await applyMutation(tx, ctx.userId, ctx.organizationId, m);

          // Registrar en cola con estado final
          await tx
            .insert(fieldSyncQueue)
            .values({
              organizationId: ctx.organizationId,
              userId: ctx.userId,
              deviceId,
              clientUuid: m.clientUuid,
              entity: m.entity,
              op: m.op,
              payload: m.payload,
              clientVersion: m.clientVersion,
              status:
                applied.status === "applied"
                  ? "applied"
                  : applied.status === "conflict"
                    ? "conflict"
                    : "rejected",
              appliedAt: applied.status === "applied" ? new Date() : null,
              appliedRecordId:
                applied.status === "applied" ? (applied as { serverId: string }).serverId : null,
              conflictServerVersion:
                applied.status === "conflict"
                  ? (applied as { serverVersion: number }).serverVersion
                  : null,
              error: applied.status === "rejected" ? applied.error : null,
            })
            .onConflictDoUpdate({
              target: [fieldSyncQueue.deviceId, fieldSyncQueue.clientUuid],
              set: {
                status:
                  applied.status === "applied"
                    ? "applied"
                    : applied.status === "conflict"
                      ? "conflict"
                      : "rejected",
                appliedAt: applied.status === "applied" ? new Date() : null,
                appliedRecordId:
                  applied.status === "applied" ? (applied as { serverId: string }).serverId : null,
                conflictServerVersion:
                  applied.status === "conflict"
                    ? (applied as { serverVersion: number }).serverVersion
                    : null,
                error: applied.status === "rejected" ? applied.error : null,
              },
            });

          return applied;
        },
      );
      results.push(res);
    } catch (err) {
      logger.error({ err, clientUuid: m.clientUuid }, "sync mutation failed");
      const msg = err instanceof Error ? err.message : String(err);
      results.push({ clientUuid: m.clientUuid, status: "rejected", error: msg });
    }
  }

  return NextResponse.json({ ok: true, data: { results, serverTime: Date.now() } });
}

// ============ Aplicación por entidad ============
type Tx = Parameters<Parameters<typeof withTenantTx>[1]>[0];

async function applyMutation(
  tx: Tx,
  userId: string,
  organizationId: string,
  m: z.infer<typeof mutationSchema>,
): Promise<
  | { clientUuid: string; status: "applied"; serverId: string }
  | { clientUuid: string; status: "conflict"; serverVersion: number; serverState: unknown }
  | { clientUuid: string; status: "rejected"; error: string }
> {
  const { clientUuid, entity, op, payload, clientVersion } = m;

  if (entity === "fusion" && op === "create") {
    return createFusionMutation(tx, userId, organizationId, clientUuid, payload);
  }
  if (entity === "fusion" && op === "delete") {
    return deleteFusionMutation(tx, userId, organizationId, clientUuid, payload);
  }
  if (entity === "box" && op === "update") {
    return updateBoxMutation(tx, userId, organizationId, clientUuid, clientVersion, payload);
  }
  if (entity === "client" && op === "update") {
    return updateClientMutation(tx, userId, organizationId, clientUuid, clientVersion, payload);
  }
  return { clientUuid, status: "rejected", error: `unsupported ${entity}/${op}` };
}

// ---- Fusion create (sin version; UNIQUE en fusion_endpoints blinda duplicados) ----
const fusionCreateSchema = z.object({
  boxId: z.string().uuid(),
  endpointA: endpointRefSchema,
  endpointB: endpointRefSchema,
  lossDb: z.number().optional(),
  notes: z.string().optional(),
  photoFileId: z.string().uuid().optional(),
});

async function createFusionMutation(
  tx: Tx,
  userId: string,
  organizationId: string,
  clientUuid: string,
  payload: unknown,
): ReturnType<typeof applyMutation> {
  const parsed = fusionCreateSchema.safeParse(payload);
  if (!parsed.success) return { clientUuid, status: "rejected", error: "validation_error" };
  const input = parsed.data;

  // Pre-flight canFuse usando datos del servidor
  const resolveEndpoint = async (
    ref: z.infer<typeof endpointRefSchema>,
  ): Promise<CanFuseEndpoint | null> => {
    if (ref.kind === "fiber") {
      const row = await tx.execute<{
        id: string;
        cable_id: string;
        status: string;
        org_id: string;
        src_box: string | null;
        tgt_box: string | null;
      }>(sql`
        SELECT f.id, f.cable_id, f.status::text AS status, f.organization_id AS org_id,
               c.source_box_id AS src_box, c.target_box_id AS tgt_box
          FROM fibers f
          INNER JOIN cables c ON c.id = f.cable_id
          WHERE f.id = ${ref.id}::uuid
          LIMIT 1;
      `);
      const f = row[0];
      if (!f) return null;
      const boxId = f.src_box === input.boxId ? f.src_box : f.tgt_box === input.boxId ? f.tgt_box : (f.src_box ?? f.tgt_box);
      return {
        kind: "fiber",
        fiberId: f.id,
        organizationId: f.org_id,
        boxId,
        cableId: f.cable_id,
        alreadyFused: f.status === "fused",
      };
    }
    const row = await tx.execute<{
      id: string;
      splitter_id: string;
      kind: "input" | "output";
      org_id: string;
      box_id: string;
    }>(sql`
      SELECT sp.id, sp.splitter_id, sp.kind::text AS kind, sp.organization_id AS org_id, s.box_id
        FROM splitter_ports sp
        INNER JOIN splitters s ON s.id = sp.splitter_id
        WHERE sp.id = ${ref.id}::uuid
        LIMIT 1;
    `);
    const p = row[0];
    if (!p) return null;
    return {
      kind: "splitter_port",
      portId: p.id,
      organizationId: p.org_id,
      boxId: p.box_id,
      splitterId: p.splitter_id,
      portKind: p.kind,
      alreadyFused: false,
    };
  };

  const a = await resolveEndpoint(input.endpointA);
  const b = await resolveEndpoint(input.endpointB);
  if (!a || !b) return { clientUuid, status: "rejected", error: "endpoint_not_found" };

  const check = canFuse(a, b);
  if (!check.ok) return { clientUuid, status: "rejected", error: check.code ?? "rejected" };

  try {
    const [row] = await tx
      .insert(fusions)
      .values({
        organizationId,
        boxId: input.boxId,
        endpointAKind: a.kind,
        endpointAFiberId: a.kind === "fiber" ? a.fiberId : null,
        endpointASplitterPortId: a.kind === "splitter_port" ? a.portId : null,
        endpointBKind: b.kind,
        endpointBFiberId: b.kind === "fiber" ? b.fiberId : null,
        endpointBSplitterPortId: b.kind === "splitter_port" ? b.portId : null,
        lossDb: input.lossDb != null ? String(input.lossDb) : null,
        notes: input.notes ?? null,
        photoFileId: input.photoFileId ?? null,
        technicianId: userId,
      })
      .returning({ id: fusions.id });
    if (!row) return { clientUuid, status: "rejected", error: "insert_failed" };
    return { clientUuid, status: "applied", serverId: row.id };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("fusion_endpoints_fiber_unique") || msg.includes("fusion_endpoints_port_unique")) {
      return { clientUuid, status: "rejected", error: "already_fused" };
    }
    return { clientUuid, status: "rejected", error: msg };
  }
}

// ---- Fusion delete (sin version check; asume invariantes) ----
async function deleteFusionMutation(
  tx: Tx,
  _userId: string,
  organizationId: string,
  clientUuid: string,
  payload: unknown,
): ReturnType<typeof applyMutation> {
  const id = z.object({ id: z.string().uuid() }).safeParse(payload);
  if (!id.success) return { clientUuid, status: "rejected", error: "validation_error" };
  await tx
    .delete(fusions)
    .where(and(eq(fusions.id, id.data.id), eq(fusions.organizationId, organizationId)));
  return { clientUuid, status: "applied", serverId: id.data.id };
}

// ---- Box update con LWW + version check ----
const boxUpdateSchema = z.object({
  id: z.string().uuid(),
  notes: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  status: z.string().optional(),
});

async function updateBoxMutation(
  tx: Tx,
  userId: string,
  organizationId: string,
  clientUuid: string,
  clientVersion: number | null,
  payload: unknown,
): ReturnType<typeof applyMutation> {
  const parsed = boxUpdateSchema.safeParse(payload);
  if (!parsed.success) return { clientUuid, status: "rejected", error: "validation_error" };
  const input = parsed.data;

  const [current] = await tx
    .select({ id: boxes.id, version: boxes.version })
    .from(boxes)
    .where(and(eq(boxes.id, input.id), eq(boxes.organizationId, organizationId)))
    .limit(1);

  if (!current) return { clientUuid, status: "rejected", error: "not_found" };

  if (clientVersion != null && clientVersion !== current.version) {
    // Conflicto: el cliente editó sobre una versión obsoleta
    return {
      clientUuid,
      status: "conflict",
      serverVersion: current.version,
      serverState: { id: current.id, version: current.version },
    };
  }

  const updates: Partial<typeof boxes.$inferInsert> = { updatedBy: userId };
  if (input.notes !== undefined) updates.notes = input.notes;
  if (input.address !== undefined) updates.address = input.address;
  if (input.status !== undefined) updates.status = input.status as never;

  await tx
    .update(boxes)
    .set(updates)
    .where(and(eq(boxes.id, input.id), eq(boxes.organizationId, organizationId)));
  return { clientUuid, status: "applied", serverId: input.id };
}

// ---- Client update con LWW ----
const clientUpdateSchema = z.object({
  id: z.string().uuid(),
  phone: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  status: z.string().optional(),
});

async function updateClientMutation(
  tx: Tx,
  userId: string,
  organizationId: string,
  clientUuid: string,
  clientVersion: number | null,
  payload: unknown,
): ReturnType<typeof applyMutation> {
  const parsed = clientUpdateSchema.safeParse(payload);
  if (!parsed.success) return { clientUuid, status: "rejected", error: "validation_error" };
  const input = parsed.data;

  const [current] = await tx
    .select({ id: clients.id, version: clients.version })
    .from(clients)
    .where(and(eq(clients.id, input.id), eq(clients.organizationId, organizationId)))
    .limit(1);
  if (!current) return { clientUuid, status: "rejected", error: "not_found" };

  if (clientVersion != null && clientVersion !== current.version) {
    return {
      clientUuid,
      status: "conflict",
      serverVersion: current.version,
      serverState: { id: current.id, version: current.version },
    };
  }

  const updates: Partial<typeof clients.$inferInsert> = { updatedBy: userId };
  if (input.phone !== undefined) updates.phone = input.phone;
  if (input.email !== undefined) updates.email = input.email;
  if (input.notes !== undefined) updates.notes = input.notes;
  if (input.status !== undefined) updates.status = input.status as never;

  await tx
    .update(clients)
    .set(updates)
    .where(and(eq(clients.id, input.id), eq(clients.organizationId, organizationId)));
  return { clientUuid, status: "applied", serverId: input.id };
}
