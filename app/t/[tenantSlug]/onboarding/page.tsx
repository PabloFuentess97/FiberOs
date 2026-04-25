import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth/session";

interface Props {
  params: Promise<{ tenantSlug: string }>;
}

export default async function OnboardingPage({ params }: Props) {
  const { tenantSlug } = await params;
  const session = await getCurrentSession();
  if (!session?.user) redirect("/");

  return (
    <div className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="text-3xl font-semibold">Bienvenido a FibraOS · {tenantSlug}</h1>
      <p className="mt-3 text-[var(--color-muted)]">
        En este wizard te pediremos (Sprint 2+):
      </p>
      <ol className="mt-6 flex flex-col gap-3">
        <li className="rounded-lg border border-[var(--color-border)] p-4">
          <span className="text-xs uppercase tracking-wide text-[var(--color-muted)]">Paso 1</span>
          <h2 className="mt-1 font-medium">Branding básico</h2>
          <p className="text-sm text-[var(--color-muted)]">Logo, color primario.</p>
        </li>
        <li className="rounded-lg border border-[var(--color-border)] p-4">
          <span className="text-xs uppercase tracking-wide text-[var(--color-muted)]">Paso 2</span>
          <h2 className="mt-1 font-medium">Importar Excel (opcional)</h2>
          <p className="text-sm text-[var(--color-muted)]">Migra tu inventario existente.</p>
        </li>
        <li className="rounded-lg border border-[var(--color-border)] p-4">
          <span className="text-xs uppercase tracking-wide text-[var(--color-muted)]">Paso 3</span>
          <h2 className="mt-1 font-medium">Invitar equipo</h2>
          <p className="text-sm text-[var(--color-muted)]">Jefe de departamento + 1 técnico.</p>
        </li>
        <li className="rounded-lg border border-[var(--color-border)] p-4">
          <span className="text-xs uppercase tracking-wide text-[var(--color-muted)]">Paso 4</span>
          <h2 className="mt-1 font-medium">Tour rápido</h2>
          <p className="text-sm text-[var(--color-muted)]">Mapa · caja · PWA.</p>
        </li>
      </ol>
      <div className="mt-8 flex justify-end">
        <a
          href="/"
          className="rounded-md bg-[var(--brand-primary)] px-4 py-2 text-sm font-medium text-white"
        >
          Ir al dashboard
        </a>
      </div>
    </div>
  );
}
