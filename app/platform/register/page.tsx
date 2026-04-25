import Link from "next/link";
import { RegisterForm } from "./register-form";

export default function RegisterPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Crear cuenta</h1>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          14 días de prueba. Sin tarjeta.
        </p>
      </div>
      <RegisterForm />
      <p className="text-sm text-[var(--color-muted)]">
        ¿Ya tienes cuenta?{" "}
        <Link href="/login" className="text-[var(--brand-primary)] hover:underline">
          Entrar
        </Link>
      </p>
    </div>
  );
}
