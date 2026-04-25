"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { requireTenantContext } from "@/lib/tenancy/guards";
import { withTenantTx } from "@/lib/tenancy/context";
import { clients, clientStatus } from "@/lib/db/schema/clients";
import { pointSQL } from "@/lib/geo/postgis";
import { logger } from "@/lib/observability/logger";

const clientSchema = z.object({
  externalCode: z.string().max(40).optional().or(z.literal("")),
  name: z.string().min(2).max(120),
  documentId: z.string().max(40).optional().or(z.literal("")),
  phone: z.string().max(40).optional().or(z.literal("")),
  email: z.string().email().optional().or(z.literal("")),
  address: z.string().min(2).max(200),
  ontSerial: z.string().max(60).optional().or(z.literal("")),
  ontModel: z.string().max(60).optional().or(z.literal("")),
  dropFiberId: z.string().uuid().optional().or(z.literal("")),
  status: z.enum(clientStatus.enumValues).default("pending"),
  installedAt: z.string().optional().or(z.literal("")),
  notes: z.string().max(2000).optional().or(z.literal("")),
  lat: z.coerce.number().min(-90).max(90).optional().nullable(),
  lng: z.coerce.number().min(-180).max(180).optional().nullable(),
});

export type ClientFormState = {
  error?: string;
  fieldErrors?: Record<string, string[]>;
  clientId?: string;
};

export async function createClientAction(
  _prev: ClientFormState,
  formData: FormData,
): Promise<ClientFormState> {
  const ctx = await requireTenantContext();
  if (!ctx) return { error: "unauthorized" };
  if (!["admin", "manager"].includes(ctx.role)) return { error: "forbidden" };

  const raw = Object.fromEntries(formData.entries());
  const parsed = clientSchema.safeParse(raw);
  if (!parsed.success) return { error: "validation_error", fieldErrors: parsed.error.flatten().fieldErrors };

  const data = parsed.data;
  try {
    const id = await withTenantTx(
      { userId: ctx.userId, organizationId: ctx.organizationId, impersonatedBy: ctx.impersonatedBy },
      async (tx) => {
        const loc =
          data.lat != null && data.lng != null
            ? (pointSQL({ lat: data.lat, lng: data.lng }) as unknown as string)
            : null;
        const [row] = await tx
          .insert(clients)
          .values({
            organizationId: ctx.organizationId,
            externalCode: data.externalCode || null,
            name: data.name,
            documentId: data.documentId || null,
            phone: data.phone || null,
            email: data.email || null,
            address: data.address,
            location: loc,
            ontSerial: data.ontSerial || null,
            ontModel: data.ontModel || null,
            dropFiberId: data.dropFiberId || null,
            status: data.status,
            installedAt: data.installedAt || null,
            notes: data.notes || null,
            createdBy: ctx.userId,
            updatedBy: ctx.userId,
          })
          .returning({ id: clients.id });
        if (!row) throw new Error("insert failed");
        return row.id;
      },
    );
    revalidatePath("/clients");
    return { clientId: id };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("clients_org_ont_serial_unique")) {
      return { error: "Ese serial de ONT ya está registrado en otro cliente." };
    }
    if (msg.includes("clients_org_external_code_unique")) {
      return { error: "Ese código externo ya existe en otro cliente." };
    }
    if (msg.includes("clients_one_per_drop_fiber")) {
      return { error: "Esa fibra de acometida ya está asignada a otro cliente." };
    }
    logger.error({ err }, "createClientAction failed");
    return { error: "internal" };
  }
}

export async function deleteClientAction(formData: FormData): Promise<void> {
  const ctx = await requireTenantContext();
  if (!ctx) throw new Error("unauthorized");
  if (!["admin", "manager"].includes(ctx.role)) throw new Error("forbidden");

  const id = z.string().uuid().parse(formData.get("id"));
  await withTenantTx(
    { userId: ctx.userId, organizationId: ctx.organizationId, impersonatedBy: ctx.impersonatedBy },
    async (tx) => {
      await tx
        .update(clients)
        .set({ deletedAt: new Date(), updatedBy: ctx.userId })
        .where(and(eq(clients.id, id), eq(clients.organizationId, ctx.organizationId)));
    },
  );
  revalidatePath("/clients");
}
