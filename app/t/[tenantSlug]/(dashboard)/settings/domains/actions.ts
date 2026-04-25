"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { requireTenantContext } from "@/lib/tenancy/guards";
import { withTenantTx } from "@/lib/tenancy/context";
import { tenantDomains } from "@/lib/db/schema/tenancy";
import { domainProvider } from "@/lib/domains/provider";
import { domainVerifierQueue } from "@/lib/queues";
import { invalidateTenantCache } from "@/lib/tenancy/resolve";
import { logger } from "@/lib/observability/logger";

const RESERVED = new Set([
  "app", "www", "api", "admin", "docs", "status", "blog", "mail", "ftp",
  "cdn", "static", "assets", "help", "support", "marketing", "platform",
  "super-admin", "auth", "dashboard", "billing", "settings", "onboarding",
]);

const addSchema = z.object({
  hostname: z
    .string()
    .min(3)
    .max(253)
    .regex(/^[a-z0-9.-]+$/i, "Hostname inválido")
    .transform((s) => s.toLowerCase().trim().replace(/^https?:\/\//, "").replace(/\/$/, "")),
});

export type AddDomainState = {
  error?: string;
  domainId?: string;
  dns?: Array<{ kind: string; name: string; value: string; required: boolean }>;
};

export async function addDomainAction(
  _prev: AddDomainState,
  formData: FormData,
): Promise<AddDomainState> {
  const ctx = await requireTenantContext();
  if (!ctx) return { error: "unauthorized" };
  if (ctx.role !== "admin") return { error: "forbidden" };

  const parsed = addSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "validation_error" };
  }
  const hostname = parsed.data.hostname;

  const root = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "fibraos.com";
  // No permitir subdominios de fibraos.com desde aquí (se crean en onboarding)
  if (hostname.endsWith(`.${root}`) || hostname === root) {
    return { error: "Este dominio pertenece a FibraOS." };
  }
  // Evitar reservados
  const firstLabel = hostname.split(".")[0] ?? "";
  if (RESERVED.has(firstLabel)) {
    return { error: `Nombre reservado: ${firstLabel}` };
  }

  try {
    const { verificationToken, dns } = await domainProvider().registerDomain(
      hostname,
      ctx.organizationId,
    );

    const domainId = await withTenantTx(
      { userId: ctx.userId, organizationId: ctx.organizationId, impersonatedBy: ctx.impersonatedBy },
      async (tx) => {
        const [row] = await tx
          .insert(tenantDomains)
          .values({
            organizationId: ctx.organizationId,
            hostname,
            isPrimary: false,
            isSubdomain: false,
            status: "pending_dns",
            verificationToken,
          })
          .returning({ id: tenantDomains.id });
        if (!row) throw new Error("insert_failed");
        return row.id;
      },
    );

    // Encolar primera verificación en 30s
    await domainVerifierQueue().add(
      `verify:${domainId}`,
      { domainId },
      { delay: 30_000 },
    );

    revalidatePath("/settings/domains");
    return { domainId, dns };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("tenant_domains_hostname")) {
      return { error: "Ese hostname ya está registrado." };
    }
    if (msg.includes("plan_limit_exceeded")) {
      return { error: "Has alcanzado el límite de dominios de tu plan. Upgrade en /settings/billing." };
    }
    logger.error({ err }, "add_domain_failed");
    return { error: "internal" };
  }
}

export async function removeDomainAction(formData: FormData): Promise<void> {
  const ctx = await requireTenantContext();
  if (!ctx || ctx.role !== "admin") throw new Error("forbidden");
  const id = z.string().uuid().parse(formData.get("id"));

  const [row] = await withTenantTx(
    { userId: ctx.userId, organizationId: ctx.organizationId, impersonatedBy: ctx.impersonatedBy },
    async (tx) => {
      return tx
        .select({ hostname: tenantDomains.hostname })
        .from(tenantDomains)
        .where(and(eq(tenantDomains.id, id), eq(tenantDomains.organizationId, ctx.organizationId)))
        .limit(1);
    },
  );
  if (!row) return;

  await domainProvider().unregisterDomain(row.hostname);
  await withTenantTx(
    { userId: ctx.userId, organizationId: ctx.organizationId, impersonatedBy: ctx.impersonatedBy },
    async (tx) => {
      await tx
        .delete(tenantDomains)
        .where(and(eq(tenantDomains.id, id), eq(tenantDomains.organizationId, ctx.organizationId)));
    },
  );
  await invalidateTenantCache(row.hostname).catch(() => {});
  revalidatePath("/settings/domains");
}

export async function retryVerificationAction(formData: FormData): Promise<void> {
  const ctx = await requireTenantContext();
  if (!ctx || ctx.role !== "admin") throw new Error("forbidden");
  const id = z.string().uuid().parse(formData.get("id"));

  await withTenantTx(
    { userId: ctx.userId, organizationId: ctx.organizationId, impersonatedBy: ctx.impersonatedBy },
    async (tx) => {
      await tx
        .update(tenantDomains)
        .set({ status: "pending_dns", checkCount: 0, lastCheckError: null })
        .where(and(eq(tenantDomains.id, id), eq(tenantDomains.organizationId, ctx.organizationId)));
    },
  );
  await domainVerifierQueue().add(`verify:${id}`, { domainId: id });
  revalidatePath("/settings/domains");
}
