"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

/**
 * Fallback del root layout cuando el error ocurre antes de que cargue el layout
 * normal. Sin CSS variables: mantenemos estilo inline para máxima resiliencia.
 */
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
    <html lang="es">
      <body style={{ fontFamily: "system-ui", padding: 40, margin: 0 }}>
        <div style={{ maxWidth: 480 }}>
          <h1 style={{ fontSize: 32 }}>Servicio no disponible</h1>
          <p style={{ color: "#64748B" }}>
            FibraOS no ha podido cargar. Estamos trabajando en ello.
          </p>
          {error.digest ? (
            <p style={{ color: "#64748B", fontSize: 12 }}>
              Código: <code>{error.digest}</code>
            </p>
          ) : null}
          <button
            type="button"
            onClick={reset}
            style={{
              background: "#1E5FFF",
              color: "#fff",
              padding: "10px 16px",
              border: 0,
              borderRadius: 6,
              cursor: "pointer",
            }}
          >
            Reintentar
          </button>
        </div>
      </body>
    </html>
  );
}
