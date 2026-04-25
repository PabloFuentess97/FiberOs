import { sql, eq, and, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { boxes, cables, fibers } from "@/lib/db/schema/network";
import { clients } from "@/lib/db/schema/clients";
import { importJobs } from "@/lib/db/schema/imports";
import { withTenantTx } from "@/lib/tenancy/context";
import { pointSQL } from "@/lib/geo/postgis";
import { colorForFiber } from "@/lib/geo/colors";
import { applyTransforms, type TransformName } from "./transforms";
import { parseXlsx, parseCsv, type ParsedSheet } from "./parser";
import { rowSchemas, type EntityType } from "./validators";
import { logger } from "@/lib/observability/logger";

export interface RunnerInput {
  jobId: string;
  organizationId: string;
  userId: string;
  entityType: EntityType;
  mapping: Record<string, { column: string; transforms: TransformName[] }>;
  dryRun: boolean;
  fileBuffer: Buffer | ArrayBuffer;
  filename: string;
}

export interface RowError {
  row: number;
  reason: string;
  values: Record<string, unknown>;
}

export interface RunnerResult {
  totalRows: number;
  processedRows: number;
  createdRows: number;
  updatedRows: number;
  errorRows: number;
  errors: RowError[];
}

/**
 * Ejecuta un job de importación. Se invoca desde:
 *   - el worker BullMQ (producción)
 *   - directamente en el endpoint cuando `dryRun=true` (UI polling)
 *
 * Comportamiento:
 *   - Idempotente vía upsert por `(organization_id, code)` o `external_code`.
 *   - `dryRun=true` usa savepoint + ROLLBACK (ver al final de la fn).
 *   - Recolecta hasta 1000 errores; más allá trunca y marca `partial`.
 */
export async function runImport(input: RunnerInput): Promise<RunnerResult> {
  const isXlsx = /\.xlsx$/i.test(input.filename);
  const parsed: ParsedSheet = isXlsx
    ? await parseXlsx(input.fileBuffer)
    : await parseCsv(
        input.fileBuffer instanceof ArrayBuffer
          ? new TextDecoder().decode(input.fileBuffer)
          : input.fileBuffer.toString("utf-8"),
      );

  const schema = rowSchemas[input.entityType];
  if (!schema) throw new Error(`entity_type_not_supported:${input.entityType}`);

  // Marcar job como running
  await db
    .update(importJobs)
    .set({ status: "running", startedAt: new Date(), totalRows: parsed.totalRows })
    .where(eq(importJobs.id, input.jobId));

  const errors: RowError[] = [];
  let created = 0;
  let updated = 0;
  let processed = 0;

  try {
    await withTenantTx(
      { userId: input.userId, organizationId: input.organizationId },
      async (tx) => {
        if (input.dryRun) {
          await tx.execute(sql`SAVEPOINT dryrun_sp`);
        }

        for (const row of parsed.rows) {
          processed++;
          try {
            // Aplicar mapping + transforms
            const rowValues: Record<string, unknown> = {};
            for (const [targetField, cfg] of Object.entries(input.mapping)) {
              const raw = row.values[cfg.column];
              rowValues[targetField] = applyTransforms(raw, cfg.transforms);
            }
            const validated = schema.parse(rowValues);

            if (input.entityType === "boxes") {
              const res = await upsertBox(tx, input.organizationId, input.userId, validated as never);
              if (res.created) created++;
              else updated++;
            } else if (input.entityType === "cables") {
              const res = await upsertCable(tx, input.organizationId, input.userId, validated as never);
              if (res.created) created++;
              else updated++;
            } else if (input.entityType === "clients") {
              const res = await upsertClient(tx, input.organizationId, input.userId, validated as never);
              if (res.created) created++;
              else updated++;
            }
          } catch (err) {
            if (errors.length < 1000) {
              errors.push({
                row: row.rowNumber,
                reason: err instanceof Error ? err.message : String(err),
                values: row.values,
              });
            }
          }
        }

        if (input.dryRun) {
          await tx.execute(sql`ROLLBACK TO SAVEPOINT dryrun_sp`);
        }
      },
    );

    const status = errors.length === 0 ? "ok" : errors.length === parsed.rows.length ? "failed" : "partial";
    await db
      .update(importJobs)
      .set({
        status,
        processedRows: processed,
        createdRows: input.dryRun ? 0 : created,
        updatedRows: input.dryRun ? 0 : updated,
        errorRows: errors.length,
        errors: errors.slice(0, 1000),
        finishedAt: new Date(),
      })
      .where(eq(importJobs.id, input.jobId));

    return {
      totalRows: parsed.totalRows,
      processedRows: processed,
      createdRows: input.dryRun ? 0 : created,
      updatedRows: input.dryRun ? 0 : updated,
      errorRows: errors.length,
      errors,
    };
  } catch (err) {
    logger.error({ err, jobId: input.jobId }, "importer_failed");
    await db
      .update(importJobs)
      .set({
        status: "failed",
        errors: [{ row: 0, reason: err instanceof Error ? err.message : String(err), values: {} }],
        finishedAt: new Date(),
      })
      .where(eq(importJobs.id, input.jobId));
    throw err;
  }
}

type Tx = Parameters<Parameters<typeof withTenantTx>[1]>[0];

// ============ Upserts ============
async function upsertBox(
  tx: Tx,
  orgId: string,
  userId: string,
  r: {
    code: string;
    type: never;
    status?: never;
    manufacturer?: string | null;
    model?: string | null;
    positions_per_tray?: number | null;
    address?: string | null;
    notes?: string | null;
    lat: number;
    lng: number;
    installed_at?: string | null;
  },
): Promise<{ created: boolean }> {
  const [existing] = await tx
    .select({ id: boxes.id })
    .from(boxes)
    .where(and(eq(boxes.organizationId, orgId), eq(boxes.code, r.code)))
    .limit(1);

  if (existing) {
    await tx
      .update(boxes)
      .set({
        type: r.type,
        status: r.status ?? "active",
        manufacturer: r.manufacturer ?? null,
        model: r.model ?? null,
        positionsPerTray: r.positions_per_tray ?? 12,
        address: r.address ?? null,
        notes: r.notes ?? null,
        location: pointSQL({ lat: r.lat, lng: r.lng }) as unknown as string,
        installedAt: r.installed_at ?? null,
        updatedBy: userId,
      })
      .where(eq(boxes.id, existing.id));
    return { created: false };
  }

  await tx.insert(boxes).values({
    organizationId: orgId,
    code: r.code,
    shortId: "", // trigger asigna
    type: r.type,
    status: r.status ?? "active",
    manufacturer: r.manufacturer ?? null,
    model: r.model ?? null,
    positionsPerTray: r.positions_per_tray ?? 12,
    address: r.address ?? null,
    notes: r.notes ?? null,
    location: pointSQL({ lat: r.lat, lng: r.lng }) as unknown as string,
    installedAt: r.installed_at ?? null,
    createdBy: userId,
    updatedBy: userId,
  });
  return { created: true };
}

async function upsertCable(
  tx: Tx,
  orgId: string,
  userId: string,
  r: {
    code: string;
    type: never;
    standard?: never;
    fiber_count: number;
    length_m?: number | null;
    source_box_code?: string | null;
    target_box_code?: string | null;
    installed_at?: string | null;
    notes?: string | null;
  },
): Promise<{ created: boolean }> {
  async function boxIdByCode(code: string | null | undefined): Promise<string | null> {
    if (!code) return null;
    const [b] = await tx
      .select({ id: boxes.id })
      .from(boxes)
      .where(and(eq(boxes.organizationId, orgId), eq(boxes.code, code), isNull(boxes.deletedAt)))
      .limit(1);
    return b?.id ?? null;
  }

  const sourceId = await boxIdByCode(r.source_box_code);
  const targetId = await boxIdByCode(r.target_box_code);

  if (r.source_box_code && !sourceId) {
    throw new Error(`caja origen no encontrada: ${r.source_box_code}`);
  }
  if (r.target_box_code && !targetId) {
    throw new Error(`caja destino no encontrada: ${r.target_box_code}`);
  }

  const [existing] = await tx
    .select({ id: cables.id })
    .from(cables)
    .where(and(eq(cables.organizationId, orgId), eq(cables.code, r.code)))
    .limit(1);

  if (existing) {
    await tx
      .update(cables)
      .set({
        type: r.type,
        standard: r.standard ?? "G657A2",
        fiberCount: r.fiber_count,
        lengthM: r.length_m != null ? String(r.length_m) : null,
        sourceBoxId: sourceId,
        targetBoxId: targetId,
        installedAt: r.installed_at ?? null,
        notes: r.notes ?? null,
        updatedBy: userId,
      })
      .where(eq(cables.id, existing.id));
    return { created: false };
  }

  const [inserted] = await tx
    .insert(cables)
    .values({
      organizationId: orgId,
      code: r.code,
      type: r.type,
      standard: r.standard ?? "G657A2",
      fiberCount: r.fiber_count,
      lengthM: r.length_m != null ? String(r.length_m) : null,
      sourceBoxId: sourceId,
      targetBoxId: targetId,
      installedAt: r.installed_at ?? null,
      notes: r.notes ?? null,
      createdBy: userId,
      updatedBy: userId,
    })
    .returning({ id: cables.id });

  if (inserted) {
    const rows = Array.from({ length: r.fiber_count }, (_, i) => ({
      organizationId: orgId,
      cableId: inserted.id,
      number: i + 1,
      color: colorForFiber(i + 1),
    }));
    for (let i = 0; i < rows.length; i += 500) {
      await tx.insert(fibers).values(rows.slice(i, i + 500));
    }
  }
  return { created: true };
}

async function upsertClient(
  tx: Tx,
  orgId: string,
  userId: string,
  r: {
    name: string;
    address: string;
    external_code?: string | null;
    document_id?: string | null;
    phone?: string | null;
    email?: string | null;
    ont_serial?: string | null;
    ont_model?: string | null;
    drop_cable_code?: string | null;
    drop_fiber_number?: number | null;
    status?: never;
    installed_at?: string | null;
    lat?: number | null;
    lng?: number | null;
    notes?: string | null;
  },
): Promise<{ created: boolean }> {
  // Resolver drop_fiber_id si nos dan cable+número
  let dropFiberId: string | null = null;
  if (r.drop_cable_code && r.drop_fiber_number) {
    const [row] = await tx.execute<{ id: string }>(sql`
      SELECT f.id FROM fibers f
      INNER JOIN cables c ON c.id = f.cable_id
      WHERE c.organization_id = ${orgId}
        AND c.code = ${r.drop_cable_code}
        AND f.number = ${r.drop_fiber_number}
      LIMIT 1;
    `);
    if (!row) throw new Error(`drop fiber no encontrada: ${r.drop_cable_code}:${r.drop_fiber_number}`);
    dropFiberId = row.id;
  }

  const locationSQL =
    r.lat != null && r.lng != null
      ? (pointSQL({ lat: r.lat, lng: r.lng }) as unknown as string)
      : null;

  // Upsert por external_code si existe, si no por (ont_serial)
  if (r.external_code) {
    const [existing] = await tx
      .select({ id: clients.id })
      .from(clients)
      .where(
        and(
          eq(clients.organizationId, orgId),
          eq(clients.externalCode, r.external_code),
          isNull(clients.deletedAt),
        ),
      )
      .limit(1);
    if (existing) {
      await tx
        .update(clients)
        .set({
          name: r.name,
          address: r.address,
          documentId: r.document_id ?? null,
          phone: r.phone ?? null,
          email: r.email ?? null,
          ontSerial: r.ont_serial ?? null,
          ontModel: r.ont_model ?? null,
          dropFiberId,
          status: r.status ?? "pending",
          installedAt: r.installed_at ?? null,
          location: locationSQL,
          notes: r.notes ?? null,
          updatedBy: userId,
        })
        .where(eq(clients.id, existing.id));
      return { created: false };
    }
  }

  await tx.insert(clients).values({
    organizationId: orgId,
    externalCode: r.external_code ?? null,
    name: r.name,
    documentId: r.document_id ?? null,
    phone: r.phone ?? null,
    email: r.email ?? null,
    address: r.address,
    location: locationSQL,
    ontSerial: r.ont_serial ?? null,
    ontModel: r.ont_model ?? null,
    dropFiberId,
    status: r.status ?? "pending",
    installedAt: r.installed_at ?? null,
    notes: r.notes ?? null,
    createdBy: userId,
    updatedBy: userId,
  });
  return { created: true };
}
