# Sprint 0 — Resumen

- Fecha: 2026-04-23
- Objetivo (§23): repo funcional con CI, dev env, autenticación básica.

## Entregado

- Estructura de directorios según §6 (marketing, platform, super-admin, t/[tenantSlug], api).
- `package.json` con stack completo (§4 y §26).
- TypeScript `strict` + `noUncheckedIndexedAccess` activos.
- Tailwind CSS v4 con variables CSS nativas para branding dinámico.
- Biome configurado (lint + format, un solo binario).
- Drizzle ORM con schema inicial: `users`, `sessions`, `accounts`, `verifications`, `organizations`, `organization_members`, `invitations`, `tenant_slug_aliases`, `tenant_domains`, `tenant_branding`.
- Better Auth: email+password + magic link + plugin para `trustedOrigins` dinámico (implementación completa en Sprint 1).
- `docker-compose.yml` con `postgis/postgis:16-3.4`, `redis:7`, `minio`, `mailpit`.
- `middleware.ts` con rewrites estáticos (tenant resolver con BD queda para Sprint 1).
- Layouts base: marketing, platform (login/register/forgot-password/select-organization), super-admin, tenant.
- `scripts/seed.ts` idempotente con org demo + user admin (`admin@demo.test / Demo1234!`).
- GitHub Actions `ci.yml`: lint, typecheck, unit tests con servicios pg+redis.
- ADR-001 "Stack técnico elegido" escrita.
- `CLAUDE.md` en la raíz del proyecto con reglas para el agente constructor.

## Decisiones tomadas fuera del blueprint

1. **Sentry diferido a Sprint 8.** Durante Sprints 0–7 se usa `pino` + consola. El usuario aprobó.
2. **`S3_PUBLIC_URL` en dev apunta a MinIO path-style.** Para R2 en prod se configurará el custom domain `files.fibraos.com` en Sprint 5.
3. **`typedRoutes: false`** porque aún produce fricción con rutas dinámicas multi-segment (`/t/[tenantSlug]/...`).
4. **`prepare: false` en cliente postgres.** Evita incompatibilidades con PgBouncer en session-mode que ocasionalmente aparecen con prepared statements, a coste mínimo de rendimiento.

## Bloqueadores / dependencias externas

- Nada bloquea Sprint 1 localmente. Se asume `fibraos.local` vía `/etc/hosts`:

  ```
  127.0.0.1  fibraos.local www.fibraos.local app.fibraos.local admin.fibraos.local demo.fibraos.local
  ```

- Para staging/producción se necesitará (§28):
  - Dominio `fibraos.com` comprado + DNS delegado a Cloudflare (Sprint 7).
  - Cuenta MapTiler con API key (Sprint 2).
  - Cuenta Resend con dominio verificado (Sprint 1).

## Definition of Done

- [x] `pnpm install` sin errores.
- [x] `docker compose up -d` levanta Postgres+PostGIS, Redis, MinIO y Mailpit.
- [x] `pnpm db:push` aplica schema inicial.
- [x] `pnpm seed` crea org demo + admin.
- [x] `pnpm dev` arranca el server.
- [x] `/login` carga; registrar/iniciar sesión funciona end-to-end.
- [x] `pnpm lint`, `pnpm typecheck`, `pnpm test` verdes.
- [x] CI plantilla preparada (verde en primer push).
- [x] ADR-001 escrita.

## Siguientes pasos (Sprint 1)

1. `resolveTenantByHost` con cache Redis (60s TTL) + invalidación explícita.
2. Trigger BD `check_org_slug_reserved` + regex.
3. Onboarding wizard con creación de organización tras registro.
4. RLS activado en todas las tablas de dominio (las que añadiremos).
5. `withTenantTx` helper (ya esbozado en `lib/tenancy/context.ts`).
6. Trigger genérico `fn_audit_trigger` + `audit_log`.
7. ADR-002, ADR-003, ADR-010, ADR-011, ADR-012, ADR-014, ADR-020.
