// Hook de Next.js 15 para inicializar Sentry en el runtime correcto.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export async function onRequestError(...args: Parameters<typeof defaultOnRequestError>) {
  // Sentry trackea errores de RSC / Route Handlers automáticamente si DSN está configurado
  const { captureRequestError } = await import("@sentry/nextjs");
  return captureRequestError(...(args as Parameters<typeof captureRequestError>));
}

// Fallback si Sentry no está instalado en el bundle (dev sin DSN)
async function defaultOnRequestError() {
  /* noop */
}
