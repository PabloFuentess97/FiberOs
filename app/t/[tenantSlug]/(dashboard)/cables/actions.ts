"use server";

import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { requireTenantContext } from "@/lib/tenancy/guards";
import { withTenantTx } from "@/lib/tenancy/context";
import { cables, fibers, cableType, fiberStandard } from "@/lib/db/schema/network";
import { lineStringSQL } from "@/lib/geo/postgis";
import { colorForFiber } from "@/lib/geo/colors";
import { logger } from "@/lib/observability/logger";

const pointSchema = z.object({ lat: z.number(), lng: z.number() });

const createCableSchema = z.object({
  code: z.string().min(2).max(40),
  type: z.enum(cableType.enumValues),
  standard: z.enum(fiberStandard.enumValues).default("G657A2"),
  fiberCount: z.coerce.number().int().positive().max(288),
  lengthM: z.coerce.number().nonnegative().optional(),
  sourceBoxId: z.string().uuid().optional().or(z.literal("")),
  targetBoxId: z.string().uuid().optional().or(z.literal("")),
  notes: z.string().max(2000).optional().or(z.literal("")),
  path: z.array(pointSchema).min(2),
});

export type CreateCableInput = z.infer<typeof createCableSchema>;

export type CreateCableResult =
  | { ok: true; cableId: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

/**
 * Crea cable + autogenera N fibras con color TIA-598-C en la misma transacción.
 * Firma sin `_prevState` porque el formulario lo invoca con objeto estructurado
 * (el path se serializa en JSON desde terra-draw).
 */
export async function createCableAction(raw: unknown): Promise<CreateCableResult> {
  const ctx = await requireTenantContext();
  if (!ctx) return { ok: false, error: "unauthorized" };
  if (!["admin", "manager"].includes(ctx.role)) return { ok: false, error: "forbidden" };

  const parsed = createCableSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: "validation_error",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }
  const data = parsed.data;
  const sourceBoxId = data.sourceBoxId || null;
  const targetBoxId = data.targetBoxId || null;

  try {
    const cableId = await withTenantTx(
      { userId: ctx.userId, organizationId: ctx.organizationId, impersonatedBy: ctx.impersonatedBy },
      async (tx) => {
        const [cable] = await tx
          .insert(cables)
          .values({
            organizationId: ctx.organizationId,
            code: data.code,
            type: data.type,
            standard: data.standard,
            fiberCount: data.fiberCount,
            lengthM: data.lengthM != null ? String(data.lengthM) : null,
            sourceBoxId,
            targetBoxId,
            path: lineStringSQL(data.path) as unknown as string,
            notes: data.notes || null,
            createdBy: ctx.userId,
            updatedBy: ctx.userId,
          })
          .returning({ id: cables.id });

        if (!cable) throw new Error("cable insert failed");

        const rows = Array.from({ length: data.fiberCount }, (_, i) => ({
          organizationId: ctx.organizationId,
          cableId: cable.id,
          number: i + 1,
          color: colorForFiber(i + 1),
        }));
        // INSERT masivo en chunks de 500 para mantener memory/plan size razonables
        const chunkSize = 500;
        for (let i = 0; i < rows.length; i += chunkSize) {
          await tx.insert(fibers).values(rows.slice(i, i + chunkSize));
        }

        return cable.id;
      },
    );

    revalidatePath(`/cables`);
    revalidatePath(`/map`);
    return { ok: true, cableId };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("cables_org_code_unique")) {
      return { ok: false, error: "Ese código de cable ya existe en esta organización." };
    }
    if (msg.includes("cables_distinct_endpoints")) {
      return { ok: false, error: "Origen y destino deben ser cajas distintas." };
    }
    logger.error({ err }, "createCableAction failed");
    return { ok: false, error: "internal" };
  }
}

export async function deleteCableAction(formData: FormData): Promise<void> {
  const ctx = await requireTenantContext();
  if (!ctx) throw new Error("unauthorized");
  if (!["admin", "manager"].includes(ctx.role)) throw new Error("forbidden");

  const id = z.string().uuid().parse(formData.get("id"));

  await withTenantTx(
    { userId: ctx.userId, organizationId: ctx.organizationId, impersonatedBy: ctx.impersonatedBy },
    async (tx) => {
      await tx
        .update(cables)
        .set({ deletedAt: new Date(), updatedBy: ctx.userId })
        .where(and(eq(cables.id, id), eq(cables.organizationId, ctx.organizationId)));
    },
  );
  revalidatePath(`/cables`);
  revalidatePath(`/map`);
}

/** Simula trazado de impacto (no destructivo). Sprint 4 lo conecta con clientes. */
export async function simulateCableCut(cableId: string) {
  const ctx = await requireTenantContext();
  if (!ctx) throw new Error("unauthorized");

  const rows = await withTenantTx(
    { userId: ctx.userId, organizationId: ctx.organizationId, impersonatedBy: ctx.impersonatedBy },
    async (tx) => {
      return tx.execute(sql`
        SELECT f.id, f.number, f.color, f.status
          FROM fibers f
         WHERE f.cable_id = ${cableId}
      `);
    },
  );
  return rows;
}
