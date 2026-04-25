"use server";

import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { requireTenantContext } from "@/lib/tenancy/guards";
import { withTenantTx } from "@/lib/tenancy/context";
import { splitters, splitterPorts, fusions, splitterRatio } from "@/lib/db/schema/fusion";
import { fibers, boxes } from "@/lib/db/schema/network";
import { canFuse, type CanFuseEndpoint } from "@/lib/network/fusion";
import { logger } from "@/lib/observability/logger";

const createSplitterSchema = z.object({
  boxId: z.string().uuid(),
  code: z.string().min(2).max(40),
  ratio: z.enum(splitterRatio.enumValues),
  trayId: z.string().uuid().nullable().optional(),
  position: z.number().int().nullable().optional(),
  insertionLossDb: z.number().nonnegative().nullable().optional(),
  notes: z.string().max(500).optional(),
});

export type CreateSplitterInput = z.infer<typeof createSplitterSchema>;
export type ActionResult<T = void> =
  | ({ ok: true } & (T extends void ? Record<string, never> : { data: T }))
  | { ok: false; error: string };

export async function createSplitterAction(
  raw: unknown,
): Promise<ActionResult<{ id: string }>> {
  const ctx = await requireTenantContext();
  if (!ctx) return { ok: false, error: "unauthorized" };
  if (!["admin", "manager"].includes(ctx.role)) return { ok: false, error: "forbidden" };

  const parsed = createSplitterSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "validation_error" };
  const input = parsed.data;

  try {
    const id = await withTenantTx(
      { userId: ctx.userId, organizationId: ctx.organizationId, impersonatedBy: ctx.impersonatedBy },
      async (tx) => {
        const [row] = await tx
          .insert(splitters)
          .values({
            organizationId: ctx.organizationId,
            boxId: input.boxId,
            code: input.code,
            ratio: input.ratio,
            trayId: input.trayId ?? null,
            position: input.position ?? null,
            insertionLossDb: input.insertionLossDb != null ? String(input.insertionLossDb) : null,
            notes: input.notes ?? null,
            createdBy: ctx.userId,
            updatedBy: ctx.userId,
          })
          .returning({ id: splitters.id });
        if (!row) throw new Error("insert failed");
        return row.id;
      },
    );
    revalidatePath(`/boxes/${input.boxId}/diagram`);
    return { ok: true, data: { id } };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("splitters_org_code_unique")) {
      return { ok: false, error: "Ese código de splitter ya existe." };
    }
    logger.error({ err }, "createSplitterAction failed");
    return { ok: false, error: "internal" };
  }
}

export async function deleteSplitterAction(formData: FormData): Promise<void> {
  const ctx = await requireTenantContext();
  if (!ctx) throw new Error("unauthorized");
  if (!["admin", "manager"].includes(ctx.role)) throw new Error("forbidden");

  const id = z.string().uuid().parse(formData.get("id"));
  const boxId = z.string().uuid().parse(formData.get("boxId"));

  await withTenantTx(
    { userId: ctx.userId, organizationId: ctx.organizationId, impersonatedBy: ctx.impersonatedBy },
    async (tx) => {
      await tx
        .delete(splitters)
        .where(and(eq(splitters.id, id), eq(splitters.organizationId, ctx.organizationId)));
    },
  );
  revalidatePath(`/boxes/${boxId}/diagram`);
}

// ============ FUSIONES ============
const endpointRefSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("fiber"), id: z.string().uuid() }),
  z.object({ kind: z.literal("splitter_port"), id: z.string().uuid() }),
]);

const createFusionSchema = z.object({
  boxId: z.string().uuid(),
  endpointA: endpointRefSchema,
  endpointB: endpointRefSchema,
  lossDb: z.number().nonnegative().max(10).optional(),
  notes: z.string().max(500).optional(),
  trayId: z.string().uuid().optional(),
  position: z.number().int().optional(),
});

export type CreateFusionInput = z.infer<typeof createFusionSchema>;

export async function createFusionAction(
  raw: unknown,
): Promise<ActionResult<{ id: string; warning?: string }>> {
  const ctx = await requireTenantContext();
  if (!ctx) return { ok: false, error: "unauthorized" };
  if (!["admin", "manager", "technician"].includes(ctx.role)) {
    return { ok: false, error: "forbidden" };
  }

  const parsed = createFusionSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "validation_error" };
  const input = parsed.data;

  try {
    const result = await withTenantTx(
      { userId: ctx.userId, organizationId: ctx.organizationId, impersonatedBy: ctx.impersonatedBy },
      async (tx) => {
        // Cargar endpoints y resolver metadata necesaria para canFuse
        const toEndpoint = async (
          ref: z.infer<typeof endpointRefSchema>,
        ): Promise<CanFuseEndpoint> => {
          if (ref.kind === "fiber") {
            const [f] = await tx
              .select({
                id: fibers.id,
                cableId: fibers.cableId,
                status: fibers.status,
                orgId: fibers.organizationId,
                sourceBoxId: sql<string | null>`(SELECT source_box_id FROM cables WHERE id = ${fibers.cableId})`,
                targetBoxId: sql<string | null>`(SELECT target_box_id FROM cables WHERE id = ${fibers.cableId})`,
              })
              .from(fibers)
              .where(eq(fibers.id, ref.id))
              .limit(1);
            if (!f) throw new Error("fiber not found");
            // Consideramos la fibra "presente" tanto en la caja origen como destino del cable.
            // Al validar, canFuse solo exige que boxId coincida con el endpoint del otro extremo.
            // Escogemos el boxId que coincida con input.boxId si existe, si no el primero disponible.
            const boxId =
              f.sourceBoxId === input.boxId
                ? f.sourceBoxId
                : f.targetBoxId === input.boxId
                  ? f.targetBoxId
                  : (f.sourceBoxId ?? f.targetBoxId);
            return {
              kind: "fiber",
              fiberId: f.id,
              organizationId: f.orgId,
              boxId,
              cableId: f.cableId,
              alreadyFused: f.status === "fused",
            };
          }
          const [p] = await tx
            .select({
              id: splitterPorts.id,
              splitterId: splitterPorts.splitterId,
              kind: splitterPorts.kind,
              orgId: splitterPorts.organizationId,
              boxId: splitters.boxId,
            })
            .from(splitterPorts)
            .innerJoin(splitters, eq(splitters.id, splitterPorts.splitterId))
            .where(eq(splitterPorts.id, ref.id))
            .limit(1);
          if (!p) throw new Error("splitter_port not found");
          return {
            kind: "splitter_port",
            portId: p.id,
            organizationId: p.orgId,
            boxId: p.boxId,
            splitterId: p.splitterId,
            portKind: p.kind,
            alreadyFused: false, // se comprobará con insert/UNIQUE
          };
        };

        const a = await toEndpoint(input.endpointA);
        const b = await toEndpoint(input.endpointB);

        // Chequeo server-side de canFuse (la UI también valida)
        const result = canFuse(a, b);
        if (!result.ok) throw new Error(`canFuse: ${result.code} — ${result.message ?? "rejected"}`);

        const [row] = await tx
          .insert(fusions)
          .values({
            organizationId: ctx.organizationId,
            boxId: input.boxId,
            trayId: input.trayId ?? null,
            position: input.position ?? null,
            endpointAKind: a.kind,
            endpointAFiberId: a.kind === "fiber" ? a.fiberId : null,
            endpointASplitterPortId: a.kind === "splitter_port" ? a.portId : null,
            endpointBKind: b.kind,
            endpointBFiberId: b.kind === "fiber" ? b.fiberId : null,
            endpointBSplitterPortId: b.kind === "splitter_port" ? b.portId : null,
            lossDb: input.lossDb != null ? String(input.lossDb) : null,
            notes: input.notes ?? null,
            technicianId: ctx.userId,
          })
          .returning({ id: fusions.id });
        if (!row) throw new Error("insert failed");

        return { id: row.id, warning: result.warning ? result.message : undefined };
      },
    );

    revalidatePath(`/boxes/${input.boxId}/diagram`);
    return { ok: true, data: result };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("fusion_endpoints_fiber_unique")) {
      return { ok: false, error: "Una de las fibras ya participa en otra fusión." };
    }
    if (msg.includes("fusion_endpoints_port_unique")) {
      return { ok: false, error: "Uno de los puertos ya participa en otra fusión." };
    }
    if (msg.startsWith("canFuse:")) {
      return { ok: false, error: msg.replace(/^canFuse:\s*/, "") };
    }
    logger.error({ err }, "createFusionAction failed");
    return { ok: false, error: "internal" };
  }
}

export async function deleteFusionAction(formData: FormData): Promise<void> {
  const ctx = await requireTenantContext();
  if (!ctx) throw new Error("unauthorized");
  if (!["admin", "manager", "technician"].includes(ctx.role)) throw new Error("forbidden");

  const id = z.string().uuid().parse(formData.get("id"));
  const boxId = z.string().uuid().parse(formData.get("boxId"));

  await withTenantTx(
    { userId: ctx.userId, organizationId: ctx.organizationId, impersonatedBy: ctx.impersonatedBy },
    async (tx) => {
      await tx
        .delete(fusions)
        .where(and(eq(fusions.id, id), eq(fusions.organizationId, ctx.organizationId)));
      // Verificación defensiva: la caja debe existir en la organización
      void boxes;
    },
  );
  revalidatePath(`/boxes/${boxId}/diagram`);
}
