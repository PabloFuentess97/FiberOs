import { redirect } from "next/navigation";
import { hasActiveTwoFactor } from "./two-factor";
import type { AuthContext } from "./session";

const REQUIRED_ROLES = new Set(["admin"]);

/**
 * Guard: redirige a `/settings/security` si el rol exige 2FA y el usuario
 * no lo tiene activo. Exento `/settings/security` (onde se configura) y
 * rutas de auth.
 */
export async function enforceTwoFactorIfNeeded(
  ctx: AuthContext,
  pathname: string,
): Promise<void> {
  if (!REQUIRED_ROLES.has(ctx.role)) return;
  if (pathname.startsWith("/settings/security")) return;
  if (pathname.startsWith("/api/")) return; // tratado por el propio endpoint

  const active = await hasActiveTwoFactor(ctx.userId);
  if (!active) {
    redirect("/settings/security?required=1");
  }
}

export async function superAdminNeeds2FA(userId: string): Promise<boolean> {
  const active = await hasActiveTwoFactor(userId);
  return !active;
}
