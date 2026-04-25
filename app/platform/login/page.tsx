import Link from "next/link";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Entrar</h1>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          Accede a tu panel de FibraOS.
        </p>
      </div>
      <LoginForm />
      <p className="text-sm text-[var(--color-muted)]">
        ¿No tienes cuenta?{" "}
        <Link href="/register" className="text-[var(--brand-primary)] hover:underline">
          Crear una
        </Link>
      </p>
    </div>
  );
}
