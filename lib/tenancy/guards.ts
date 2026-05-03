import { headers } from "next/headers";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  organizations,
  organizationMembers,
  tenantDomains,
  tenantSlugAliases,
  type UserRole,
} from "@/lib/db/schema/tenancy";
import { users } from "@/lib/db/schema/auth";
import { getCurrentSession } from "@/lib/auth/session";
import type { AuthContext } from "@/lib/auth/session";
import { readImpersonation } from "@/lib/auth/impersonation";
import { isSuperAdminEmail } from "@/lib/auth/super-admin";

/**
 * Resuelve el tenant actual desde headers que setea el middleware:
 *   - `x-tenant-slug` para subdominios (`<slug>.fibraos.com`).
 *   - `x-tenant-host` para dominios custom externos.
 *
 * El middleware corre en Edge runtime y NO toca BD. Esta función es
 * Server-Component-only y consulta la BD para resolver la organización.
 *
 * **Impersonación (§11.13, ADR-013)**: si hay cookie activa y no expirada,
 * y la sesión real es un super-admin, el contexto devuelve el `targetUserId`
 * como "yo" (para que las mutaciones queden a nombre del usuario) pero
 * `impersonatedBy` lleva el UUID del super-admin real.
 */
export async function requireTenantContext(): Promise<AuthContext | null> {
  const session = await getCurrentSession();
  if (!session?.user) return null;

  const h = await headers();
  const tenantSlug = h.get("x-tenant-slug");
  const tenantHost = h.get("x-tenant-host");

  // 1. Resolver organización (slug o host)
  let orgId: string | null = null;
  let orgSlug: string | null = null;

  if (tenantSlug) {
    const [row] = await db
      .select({ id: organizations.id, slug: organizations.slug })
      .from(organizations)
      .where(eq(organizations.slug, tenantSlug))
      .limit(1);
    if (row) {
      orgId = row.id;
      orgSlug = row.slug;
    } else {
      // Buscar en aliases (slug renombrado, ADR-020)
      const [alias] = await db
        .select({
          orgId: tenantSlugAliases.organizationId,
          slug: organizations.slug,
        })
        .from(tenantSlugAliases)
        .innerJoin(organizations, eq(organizations.id, tenantSlugAliases.organizationId))
        .where(eq(tenantSlugAliases.slug, tenantSlug))
        .limit(1);
      if (alias) {
        orgId = alias.orgId;
        orgSlug = alias.slug;
      }
    }
  } else if (tenantHost) {
    const [row] = await db
      .select({
        orgId: tenantDomains.organizationId,
        slug: organizations.slug,
      })
      .from(tenantDomains)
      .innerJoin(organizations, eq(organizations.id, tenantDomains.organizationId))
      .where(eq(tenantDomains.hostname, tenantHost))
      .limit(1);
    if (row) {
      orgId = row.orgId;
      orgSlug = row.slug;
    }
  }

  if (!orgId || !orgSlug) return null;

  // 2. Impersonación
  const impersonation = await readImpersonation();
  let effectiveUserId = session.user.id;
  let effectiveEmail = session.user.email;
  let impersonatedBy: string | undefined;

  if (
    impersonation &&
    impersonation.organizationId === orgId &&
    impersonation.actorUserId === session.user.id &&
    isSuperAdminEmail(session.user.email)
  ) {
    impersonatedBy = impersonation.actorUserId;
    effectiveUserId = impersonation.targetUserId;
    const [t] = await db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, impersonation.targetUserId))
      .limit(1);
    if (t) effectiveEmail = t.email;
  }

  // 3. Validar membership
  const [member] = await db
    .select({ role: organizationMembers.role })
    .from(organizationMembers)
    .where(
      and(
        eq(organizationMembers.userId, effectiveUserId),
        eq(organizationMembers.organizationId, orgId),
      ),
    )
    .limit(1);

  if (!member) return null;

  return {
    userId: effectiveUserId,
    email: effectiveEmail,
    organizationId: orgId,
    organizationSlug: orgSlug,
    role: member.role,
    impersonatedBy,
  };
}

export function hasRole(ctx: AuthContext, allowed: UserRole[]): boolean {
  return allowed.includes(ctx.role);
}
