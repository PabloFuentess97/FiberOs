"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { organizations, organizationMembers, tenantBranding, tenantDomains } from "@/lib/db/schema/tenancy";
import { getCurrentSession } from "@/lib/auth/session";
import { logger } from "@/lib/observability/logger";
import { invalidateTenantCache } from "@/lib/tenancy/resolve";

const createOrgSchema = z.object({
  name: z.string().min(2).max(80),
  slug: z
    .string()
    .min(3)
    .max(30)
    .regex(/^[a-z0-9][a-z0-9-]{2,29}$/, {
      message: "El slug solo admite minúsculas, números y guiones.",
    }),
});

export type CreateOrgState = {
  error?: string;
  fieldErrors?: Record<string, string[]>;
};

export async function createOrganizationAction(
  _prev: CreateOrgState,
  formData: FormData,
): Promise<CreateOrgState> {
  const session = await getCurrentSession();
  if (!session?.user) return { error: "unauthorized" };

  const parsed = createOrgSchema.safeParse({
    name: formData.get("name"),
    slug: formData.get("slug"),
  });

  if (!parsed.success) {
    return {
      error: "validation_error",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const { name, slug } = parsed.data;
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "fibraos.local";
  const hostname = `${slug}.${rootDomain}`;

  try {
    const result = await db.transaction(async (tx) => {
      const [org] = await tx.insert(organizations).values({ name, slug }).returning();
      if (!org) throw new Error("insert failed");

      await tx.insert(organizationMembers).values({
        organizationId: org.id,
        userId: session.user.id,
        role: "admin",
      });

      await tx.insert(tenantBranding).values({
        organizationId: org.id,
        displayName: name,
        primaryColor: "#1E5FFF",
        accentColor: "#0EA5E9",
      });

      await tx.insert(tenantDomains).values({
        organizationId: org.id,
        hostname,
        isPrimary: true,
        isSubdomain: true,
        status: "active", // wildcard SSL se emite por Caddy en prod; en dev no hace falta
      });

      return { org, hostname };
    });

    await invalidateTenantCache(result.hostname);

    logger.info({ slug, userId: session.user.id }, "organization created");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("slug reservado") || msg.includes("slug inválido")) {
      return { error: msg };
    }
    if (msg.includes("organizations_slug_unique") || msg.includes("duplicate key")) {
      return { error: "Ese slug ya está en uso. Elige otro." };
    }
    logger.error({ err }, "createOrganizationAction failed");
    return { error: "internal" };
  }

  // Redirect fuera del try/catch para que NEXT_REDIRECT no lo capture.
  const scheme = process.env.NODE_ENV === "production" ? "https" : "http";
  const port = process.env.NODE_ENV === "production" ? "" : ":3000";
  redirect(`${scheme}://${hostname}${port}/onboarding`);
}
