# Sprint 1 — Resumen

- Fecha: 2026-04-23
- Objetivo (§23): resolución por hostname, wildcard SSL, RLS, auditoría.

## Entregado

### Tenant resolver
- `lib/redis.ts` — cliente Redis lazy (ioredis) compartido por cache tenant, BullMQ y rate-limiter.
- `lib/tenancy/resolve.ts` — `resolveTenantByHost` con cache Redis 60s + invalidación explícita. Soporta subdominios, dominios custom y aliases de slug (tabla `tenant_slug_aliases`).
- `middleware.ts` en **runtime Node** (flag `experimental.nodeMiddleware`) — hace la resolución via BD cuando el host no coincide con un rewrite estático.

### Multi-tenancy en BD
- Migración SQL manual en `lib/db/migrations/sql/0001_rls_triggers.sql` que aplica:
  - Extensiones: `postgis`, `pgcrypto`, `btree_gist`.
  - Trigger `check_org_slug_reserved` + regex.
  - Función genérica `fn_audit_trigger()` con diff JSONB.
  - Aplicación del audit trigger a `organizations`, `tenant_domains`, `tenant_branding`, `invitations`.
  - RLS habilitado + política `tenant_isolation_*` en `tenant_domains`, `tenant_branding`, `invitations`, `audit_log`.
- Tabla `audit_log` expuesta en Drizzle (`lib/db/schema/audit.ts`).
- Script `scripts/apply-sql.ts` y comando `pnpm db:sql` para aplicar migraciones crudas que Drizzle no expresa bien (triggers, RLS, funciones plpgsql).

### Onboarding
- Server Action `createOrganizationAction` (validación Zod, slug reservado manejado por trigger BD).
- Página `/platform/create-organization` con form client + `useActionState`.
- Página `/t/[tenantSlug]/onboarding` placeholder (wizard visual; los pasos reales llegan con Sprint 2).
- Redirect tras registro: si el user no tiene membresías → `/create-organization`; si tiene una → subdominio directo; si tiene varias → selector.

### ADRs
- ADR-002 · Pool tenancy + RLS como doble cinturón.
- ADR-003 · Orden de middleware: tenant → auth → i18n.
- ADR-010 · PgBouncer en modo `session`.
- ADR-014 · Tenant cache en Redis local.

## Decisiones tomadas fuera del blueprint

1. **`experimental.nodeMiddleware: true`**. El blueprint asumía una combinación edge + Upstash HTTP que cambia con el self-hosted. Documentado en ADR-003.
2. **Migraciones SQL separadas en `lib/db/migrations/sql/`**. Drizzle-kit no expresa bien triggers + RLS + funciones plpgsql. Script `pnpm db:sql` las aplica en orden alfabético tras `pnpm db:push`.
3. **`tenant_slug_aliases` se redirige como tenant activo al mismo `organization.slug`**. Coherente con §12 y evita 404 durante el grace period de 90 días tras un rename.

## Bloqueadores / dependencias externas

- Para funcionamiento real de wildcard SSL (`*.fibraos.com`) → **Sprint 7** con Caddy DNS-01.
- Hasta entonces, dev usa `fibraos.local` con `/etc/hosts` (§31.7).
- Tests E2E de aislamiento org A/B → se añadirán en Sprint 2 junto a Playwright fixture.

## Definition of Done

- [x] `demo.fibraos.local:3000` sirve su dashboard tras `pnpm seed` + login.
- [x] Host desconocido → redirect a `fibraos.local/?reason=unknown_host`.
- [x] Slug reservado (p.ej. `admin`) → BD rechaza (`23514`), UI muestra mensaje.
- [x] Slug mal formado (mayúsculas, símbolos) → BD rechaza con mensaje claro.
- [x] Tablas con RLS devuelven 0 filas si `app.organization_id` no está seteado (testable en psql).
- [x] Audit log recibe inserts al modificar `tenant_branding` dentro de `withTenantTx`.
- [x] Cache Redis se invalida al crear un dominio nuevo.
- [x] ADR-002, ADR-003, ADR-010, ADR-014 escritas.

## Siguientes pasos (Sprint 2)

1. Schema completo `boxes`, `trays`, `cables`, `fibers` + triggers/RLS correspondientes (ampliar `0002_inventory.sql`).
2. CRUD `boxes` (listado tabular TanStack Table + formulario + detalle General).
3. `/map` con MapLibre + MapTiler + markers + cluster + pin-mode.
4. CRUD `cables` con dibujo `terra-draw` + autogeneración de fibras (función TS `colorForFiber` + INSERT masivo).
5. Seed realista (§21) en `scripts/seed.ts`.
6. Tests E2E: flujos 1 y 5 parcial (Playwright).
7. ADR-016 `terra-draw` + ADR-017 MapTiler.
