import Link from "next/link";
import { redirect } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { requireSuperAdmin } from "@/lib/auth/super-admin";
import { superAdminNeeds2FA } from "@/lib/auth/enforce-2fa";
import { headers } from "next/headers";

export default async function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  const sa = await requireSuperAdmin();
  if (!sa) redirect("/login?next=/super-admin");

  // Super-admin exige 2FA obligatorio en cualquier entorno excepto el propio /setup-2fa
  const h = await headers();
  const pathname = h.get("x-invoke-path") ?? "/";
  if (!pathname.startsWith("/setup-2fa") && (await superAdminNeeds2FA(sa.userId))) {
    redirect("/setup-2fa?required=1");
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex h-12 items-center justify-between border-b border-amber-500 bg-amber-50 px-4 text-sm">
        <div className="flex items-center gap-2">
          <ShieldAlert size={16} className="text-amber-700" />
          <strong>Super Admin</strong>
          <span className="text-amber-800">· {sa.email}</span>
        </div>
        <nav className="flex gap-4 text-sm">
          <Link href="/" className="hover:underline">Organizaciones</Link>
          <Link href="/metrics" className="hover:underline">Métricas</Link>
          <Link href="/domains" className="hover:underline">Dominios</Link>
          <Link href="/queues" className="hover:underline">Colas</Link>
        </nav>
      </header>
      <main className="flex-1 bg-[var(--color-surface)]">{children}</main>
    </div>
  );
}
