import Link from "next/link";

export default function ForgotPasswordPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Recuperar contraseña</h1>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          Te enviaremos un enlace por email.
        </p>
      </div>
      <p className="text-sm text-[var(--color-muted)]">
        Disponible a partir de Sprint 1 (flujo completo de magic link + reset).
      </p>
      <Link href="/login" className="text-sm text-[var(--brand-primary)] hover:underline">
        Volver
      </Link>
    </div>
  );
}
