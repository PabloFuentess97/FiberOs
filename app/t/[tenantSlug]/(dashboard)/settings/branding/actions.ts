"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireTenantContext } from "@/lib/tenancy/guards";
import { withTenantTx } from "@/lib/tenancy/context";
import { tenantBranding } from "@/lib/db/schema/tenancy";
import { logger } from "@/lib/observability/logger";

const hex = z.string().regex(/^#([0-9A-Fa-f]{6})$/, "Color hex inválido (#RRGGBB)");

const brandingSchema = z.object({
  displayName: z.string().min(2).max(80).optional().or(z.literal("")),
  primaryColor: hex.optional().or(z.literal("")),
  accentColor: hex.optional().or(z.literal("")),
  emailFromName: z.string().max(80).optional().or(z.literal("")),
  supportEmail: z.string().email().optional().or(z.literal("")),
  legalCompanyName: z.string().max(120).optional().or(z.literal("")),
  logoUrl: z.string().url().optional().or(z.literal("")),
  faviconUrl: z.string().url().optional().or(z.literal("")),
});

export type BrandingState = { error?: string; ok?: boolean };

export async function updateBrandingAction(
  _prev: BrandingState,
  formData: FormData,
): Promise<BrandingState> {
  const ctx = await requireTenantContext();
  if (!ctx) return { error: "unauthorized" };
  if (!["admin"].includes(ctx.role)) return { error: "forbidden" };

  const parsed = brandingSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "validation_error" };
  }
  const input = parsed.data;

  try {
    await withTenantTx(
      { userId: ctx.userId, organizationId: ctx.organizationId, impersonatedBy: ctx.impersonatedBy },
      async (tx) => {
        const values = {
          organizationId: ctx.organizationId,
          displayName: input.displayName || null,
          primaryColor: input.primaryColor || null,
          accentColor: input.accentColor || null,
          emailFromName: input.emailFromName || null,
          supportEmail: input.supportEmail || null,
          legalCompanyName: input.legalCompanyName || null,
          logoUrl: input.logoUrl || null,
          faviconUrl: input.faviconUrl || null,
          updatedAt: new Date(),
        };
        await tx
          .insert(tenantBranding)
          .values(values)
          .onConflictDoUpdate({
            target: tenantBranding.organizationId,
            set: values,
          });
      },
    );
    revalidatePath("/settings/branding");
    revalidatePath("/");
    return { ok: true };
  } catch (err) {
    logger.error({ err }, "update_branding_failed");
    return { error: "internal" };
  }
}
