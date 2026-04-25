"use server";

import { revalidatePath } from "next/cache";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { requireTenantContext } from "@/lib/tenancy/guards";
import { withTenantTx } from "@/lib/tenancy/context";
import { boxes, boxType, boxStatus } from "@/lib/db/schema/network";
import { pointSQL } from "@/lib/geo/postgis";
import { logger } from "@/lib/observability/logger";

const createBoxSchema = z.object({
  code: z.string().min(2).max(40),
  type: z.enum(boxType.enumValues),
  status: z.enum(boxStatus.enumValues).default("active"),
  manufacturer: z.string().max(80).optional().or(z.literal("")),
  model: z.string().max(80).optional().or(z.literal("")),
  positionsPerTray: z.coerce.number().int().positive().max(144).default(12),
  address: z.string().max(200).optional().or(z.literal("")),
  notes: z.string().max(2000).optional().or(z.literal("")),
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
});

export type CreateBoxState = {
  error?: string;
  fieldErrors?: Record<string, string[]>;
  boxId?: string;
};

export async function createBoxAction(
  _prev: CreateBoxState,
  formData: FormData,
): Promise<CreateBoxState> {
  const ctx = await requireTenantContext();
  if (!ctx) return { error: "unauthorized" };
  if (!["admin", "manager"].includes(ctx.role)) return { error: "forbidden" };

  const parsed = createBoxSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return { error: "validation_error", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const data = parsed.data;

  try {
    const boxId = await withTenantTx(
      { userId: ctx.userId, organizationId: ctx.organizationId, impersonatedBy: ctx.impersonatedBy },
      async (tx) => {
        const [row] = await tx
          .insert(boxes)
          .values({
            organizationId: ctx.organizationId,
            code: data.code,
            shortId: "", // trigger fn_boxes_set_short_id asigna uno único
            type: data.type,
            status: data.status,
            manufacturer: data.manufacturer || null,
            model: data.model || null,
            positionsPerTray: data.positionsPerTray,
            address: data.address || null,
            notes: data.notes || null,
            location: pointSQL({ lat: data.lat, lng: data.lng }) as unknown as string,
            createdBy: ctx.userId,
            updatedBy: ctx.userId,
          })
          .returning({ id: boxes.id });
        if (!row) throw new Error("insert failed");
        return row.id;
      },
    );

    revalidatePath(`/boxes`);
    revalidatePath(`/map`);
    return { boxId };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("boxes_org_code_unique") || msg.includes("duplicate key")) {
      return { error: "Ese código ya existe en esta organización." };
    }
    logger.error({ err }, "createBoxAction failed");
    return { error: "internal" };
  }
}

const updateBoxSchema = createBoxSchema.extend({
  id: z.string().uuid(),
});

export async function updateBoxAction(
  _prev: CreateBoxState,
  formData: FormData,
): Promise<CreateBoxState> {
  const ctx = await requireTenantContext();
  if (!ctx) return { error: "unauthorized" };
  if (!["admin", "manager"].includes(ctx.role)) return { error: "forbidden" };

  const parsed = updateBoxSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return { error: "validation_error", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const data = parsed.data;

  try {
    await withTenantTx(
      { userId: ctx.userId, organizationId: ctx.organizationId, impersonatedBy: ctx.impersonatedBy },
      async (tx) => {
        await tx
          .update(boxes)
          .set({
            code: data.code,
            type: data.type,
            status: data.status,
            manufacturer: data.manufacturer || null,
            model: data.model || null,
            positionsPerTray: data.positionsPerTray,
            address: data.address || null,
            notes: data.notes || null,
            location: pointSQL({ lat: data.lat, lng: data.lng }) as unknown as string,
            updatedBy: ctx.userId,
          })
          .where(and(eq(boxes.id, data.id), eq(boxes.organizationId, ctx.organizationId)));
      },
    );

    revalidatePath(`/boxes`);
    revalidatePath(`/boxes/${data.id}`);
    revalidatePath(`/map`);
    return { boxId: data.id };
  } catch (err) {
    logger.error({ err }, "updateBoxAction failed");
    return { error: "internal" };
  }
}

export async function deleteBoxAction(formData: FormData): Promise<void> {
  const ctx = await requireTenantContext();
  if (!ctx) throw new Error("unauthorized");
  if (!["admin", "manager"].includes(ctx.role)) throw new Error("forbidden");

  const id = z.string().uuid().parse(formData.get("id"));

  await withTenantTx(
    { userId: ctx.userId, organizationId: ctx.organizationId, impersonatedBy: ctx.impersonatedBy },
    async (tx) => {
      await tx
        .update(boxes)
        .set({ deletedAt: new Date(), updatedBy: ctx.userId })
        .where(and(eq(boxes.id, id), eq(boxes.organizationId, ctx.organizationId)));
    },
  );

  revalidatePath(`/boxes`);
  revalidatePath(`/map`);
}
