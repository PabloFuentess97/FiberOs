import { headers } from "next/headers";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { organizations, organizationMembers, type UserRole } from "@/lib/db/schema/tenancy";
import { users } from "@/lib/db/schema/auth";
import { getCurrentSession } from "@/lib/auth/session";
import type { AuthContext } from "@/lib/auth/session";
import { readImpersonation } from "@/lib/auth/impersonation";
import { isSuperAdminEmail } from "@/lib/auth/super-admin";

/**
 * Resuelve el tenant actual a partir del header `x-tenant-id` inyectado por
 * el middleware. Valida que el usuario sea miembro.
 *
 * **Impersonación (§11.13, ADR-013)**: si hay cookie activa y no expirada,
 * y la sesión real es un super-admin, el contexto devuelve el `targetUserId`
 * como "yo" (para que las mutaciones queden a nombre del usuario) pero
 * `impersonatedBy` lleva el UUID del super-admin real. El trigger de audit
 * graba `acted_as_by` desde `current_setting('app.acted_as_by')`.
 */
export async function requireTenantContext(): Promise<AuthContext | null> {
  const session = await getCurrentSession();
  if (!session?.user) return null;

  const h = await headers();
  const tenantId = h.get("x-tenant-id");
  if (!tenantId) return null;

  const impersonation = await readImpersonation();

  let effectiveUserId = session.user.id;
  let effectiveEmail = session.user.email;
  let impersonatedBy: string | undefined;

  if (
    impersonation &&
    impersonation.organizationId === tenantId &&
    impersonation.actorUserId === session.user.id &&
    isSuperAdminEmail(session.user.email)
  ) {
    // Asumimos la identidad del target para queries, pero audit graba actor
    impersonatedBy = impersonation.actorUserId;
    effectiveUserId = impersonation.targetUserId;
    const [t] = await db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, impersonation.targetUserId))
      .limit(1);
    if (t) effectiveEmail = t.email;
  }

  const [row] = await db
    .select({ role: organizationMembers.role, slug: organizations.slug })
    .from(organizationMembers)
    .innerJoin(organizations, eq(organizations.id, organizationMembers.organizationId))
    .where(
      and(
        eq(organizationMembers.userId, effectiveUserId),
        eq(organizationMembers.organizationId, tenantId),
      ),
    )
    .limit(1);

  if (!row) return null;

  return {
    userId: effectiveUserId,
    email: effectiveEmail,
    organizationId: tenantId,
    organizationSlug: row.slug,
    role: row.role,
    impersonatedBy,
  };
}

export function hasRole(ctx: AuthContext, allowed: UserRole[]): boolean {
  return allowed.includes(ctx.role);
}
