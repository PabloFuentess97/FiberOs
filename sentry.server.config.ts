import * as Sentry from "@sentry/nextjs";

const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.APP_ENV ?? process.env.NODE_ENV ?? "production",
    release: process.env.SENTRY_RELEASE,

    tracesSampleRate: 0.05,
    profilesSampleRate: 0,

    // Filtrar errores esperables de tenant lookup / RLS
    beforeSend(event, hint) {
      const err = hint.originalException as Error | undefined;
      if (err?.message?.includes("unknown_host")) return null;
      if (err?.message?.includes("plan_limit_exceeded")) return null;
      return event;
    },
  });
}
