import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-6xl font-bold text-[var(--color-muted)]">404</h1>
      <p className="text-lg">Esta página no existe.</p>
      <p className="max-w-md text-sm text-[var(--color-muted)]">
        El enlace puede estar roto o el recurso haberse eliminado. Revisa la URL
        o vuelve al inicio de tu organización.
      </p>
      <Link href="/" className="text-sm text-[var(--brand-primary)] underline">
        Volver al inicio
      </Link>
    </div>
  );
}
