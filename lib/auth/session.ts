import { headers } from "next/headers";
import { cache } from "react";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { organizationMembers, organizations } from "@/lib/db/schema/tenancy";
import { auth } from "./server";
import type { UserRole } from "@/lib/db/schema/tenancy";

export interface AuthContext {
  userId: string;
  email: string;
  organizationId: string;
  organizationSlug: string;
  role: UserRole;
  impersonatedBy?: string | null;
}

/**
 * Devuelve la sesión actual o null. Cacheado por request (React cache).
 */
export const getCurrentSession = cache(async () => {
  const h = await headers();
  const session = await auth.api.getSession({ headers: h });
  return session;
});

/**
 * Devuelve el contexto de autenticación con la organización activa.
 * Para Route Handlers / Server Actions que requieren tenant.
 */
export async function getAuthContextForOrg(organizationId: string): Promise<AuthContext | null> {
  const session = await getCurrentSession();
  if (!session?.user) return null;

  const [membership] = await db
    .select({
      role: organizationMembers.role,
      slug: organizations.slug,
    })
    .from(organizationMembers)
    .innerJoin(organizations, eq(organizations.id, organizationMembers.organizationId))
    .where(
      and(
        eq(organizationMembers.userId, session.user.id),
        eq(organizationMembers.organizationId, organizationId),
      ),
    )
    .limit(1);

  if (!membership) return null;

  return {
    userId: session.user.id,
    email: session.user.email,
    organizationId,
    organizationSlug: membership.slug,
    role: membership.role,
    impersonatedBy: (session.session as { impersonatedBy?: string | null }).impersonatedBy,
  };
}

export function requireRole(ctx: AuthContext, allowed: UserRole[]) {
  if (!allowed.includes(ctx.role)) {
    const err = new Error("forbidden") as Error & { code: string };
    err.code = "forbidden";
    throw err;
  }
}
