import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { magicLink } from "better-auth/plugins";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema/auth";
import { env } from "@/lib/utils/env";
import { logger } from "@/lib/observability/logger";

export const auth = betterAuth({
  secret: env.AUTH_SECRET,
  baseURL: env.NEXT_PUBLIC_APP_URL,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.users,
      session: schema.sessions,
      account: schema.accounts,
      verification: schema.verifications,
    },
  }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    requireEmailVerification: false, // habilitar en Sprint 1 cuando haya mailpit verde
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 días
    updateAge: 60 * 60 * 24,
    cookieCache: { enabled: true, maxAge: 60 },
  },
  advanced: {
    // sesiones independientes por hostname (ver blueprint §12.5)
    useSecureCookies: process.env.NODE_ENV === "production",
    defaultCookieAttributes: { sameSite: "lax" },
  },
  trustedOrigins: async () => {
    // En Sprint 1 se lee dinámicamente de tenant_domains con cache.
    const root = env.NEXT_PUBLIC_ROOT_DOMAIN;
    return [
      env.NEXT_PUBLIC_APP_URL,
      `https://${root}`,
      `https://www.${root}`,
      `https://app.${root}`,
      `https://admin.${root}`,
      `https://*.${root}`,
      // Dev local:
      `http://${root}:3000`,
      `http://app.${root}:3000`,
      `http://admin.${root}:3000`,
    ];
  },
  plugins: [
    magicLink({
      async sendMagicLink({ email, url }) {
        // Sprint 1: integrar con Resend/Mailpit. Por ahora log.
        logger.info({ email, url }, "magic link issued (log-only)");
      },
      expiresIn: 60 * 15,
    }),
  ],
  logger: {
    disabled: false,
    log: (level, message, extra) => {
      logger[level === "error" ? "error" : "info"]({ ...extra }, `[better-auth] ${message}`);
    },
  },
});

export type Auth = typeof auth;
export type AuthSession = Awaited<ReturnType<typeof auth.api.getSession>>;
