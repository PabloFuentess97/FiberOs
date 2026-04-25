"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import Link from "next/link";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-3xl font-semibold">Algo ha salido mal</h1>
      <p className="max-w-md text-sm text-[var(--color-muted)]">
        Hemos notificado el error al equipo técnico. Puedes reintentar ahora o
        volver al inicio.
      </p>
      {error.digest ? (
        <p className="text-xs text-[var(--color-muted)]">
          Código de soporte: <code>{error.digest}</code>
        </p>
      ) : null}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={reset}
          className="rounded-md bg-[var(--brand-primary)] px-4 py-2 text-sm font-medium text-white"
        >
          Reintentar
        </button>
        <Link
          href="/"
          className="rounded-md border border-[var(--color-border)] bg-white px-4 py-2 text-sm"
        >
          Ir al inicio
        </Link>
      </div>
    </div>
  );
}
