import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { readImpersonation } from "@/lib/auth/impersonation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema/auth";

/**
 * Banner rojo persistente cuando un super-admin está impersonando un usuario.
 * Server Component: lee cookie + resuelve emails. Siempre visible en dashboard.
 */
export async function ImpersonationBanner() {
  const imp = await readImpersonation();
  if (!imp) return null;

  const [[actor], [target]] = await Promise.all([
    db.select({ email: users.email }).from(users).where(eq(users.id, imp.actorUserId)).limit(1),
    db.select({ email: users.email }).from(users).where(eq(users.id, imp.targetUserId)).limit(1),
  ]);

  const remainingMin = Math.max(0, Math.floor((imp.endsAt - Date.now()) / 60_000));

  return (
    <div className="flex items-center justify-between bg-red-600 px-4 py-1.5 text-xs text-white">
      <div className="flex items-center gap-2">
        <AlertTriangle size={14} />
        <span>
          Acceso de soporte activo — <strong>{actor?.email ?? "?"}</strong> actuando como{" "}
          <strong>{target?.email ?? "?"}</strong> · {remainingMin} min restantes
        </span>
      </div>
      <Link href="/super-admin?stop=1" className="underline">
        Terminar sesión
      </Link>
    </div>
  );
}
