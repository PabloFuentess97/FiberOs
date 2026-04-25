import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_APP_ENV ?? "production",
    release: process.env.NEXT_PUBLIC_SENTRY_RELEASE,

    tracesSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
    replaysSessionSampleRate: 0,

    integrations: [Sentry.replayIntegration({ maskAllText: true, blockAllMedia: true })],

    // Reducimos ruido de errores conocidos (ResizeObserver, extensiones…)
    ignoreErrors: [
      "ResizeObserver loop limit exceeded",
      "ResizeObserver loop completed with undelivered notifications",
      "Non-Error promise rejection captured",
    ],

    beforeSend(event) {
      // Los tags de tenant se setean desde el layout tenant
      return event;
    },
  });
}
