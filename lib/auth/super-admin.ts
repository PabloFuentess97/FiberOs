import { getCurrentSession } from "./session";

/**
 * Super-admin = email en `SUPER_ADMIN_EMAILS` (coma-separado).
 * Requiere 2FA TOTP en prod (pendiente cuando Better Auth 2FA esté listo).
 */
export async function requireSuperAdmin(): Promise<{ userId: string; email: string } | null> {
  const session = await getCurrentSession();
  if (!session?.user) return null;
  const allowed = (process.env.SUPER_ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (!allowed.includes(session.user.email.toLowerCase())) return null;
  return { userId: session.user.id, email: session.user.email };
}

export function isSuperAdminEmail(email: string): boolean {
  const allowed = (process.env.SUPER_ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase());
  return allowed.includes(email.toLowerCase());
}
