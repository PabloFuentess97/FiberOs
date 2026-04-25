# FibraOS

SaaS multi-tenant de gestión de red FTTH para operadores locales. Next.js 15 + TS estricto + Postgres/PostGIS + Drizzle + Better Auth + MapLibre + React Flow + PWA. UI en español, código en inglés.

## Commands

- `pnpm dev` — dev server (requiere `docker-compose up -d`)
- `pnpm build` — build producción
- `pnpm start` — prod local
- `pnpm lint` — Biome check
- `pnpm typecheck` — `tsc --noEmit`
- `pnpm test` — Vitest unit + integración
- `pnpm test:e2e` — Playwright
- `pnpm db:push` — aplicar schema en dev (drizzle-kit push)
- `pnpm db:generate` — generar migración SQL (drizzle-kit generate)
- `pnpm db:migrate` — aplicar migraciones (prod, CI)
- `pnpm seed` — seed org demo
- `pnpm export:tenant <slug>` — backup de un tenant (RGPD)
- `docker compose up -d` — levantar servicios dev (postgres, redis, minio, mailpit)
- `docker compose -f docker-compose.prod.yml pull && docker compose -f docker-compose.prod.yml up -d` — deploy manual en servidor Hetzner

## Tech Stack

Next.js 15 (App Router) + TypeScript estricto + Tailwind v4 + shadcn/ui + Drizzle ORM + Postgres+PostGIS (Docker) + PgBouncer + Better Auth + MapLibre GL + terra-draw + React Flow + Serwist PWA + BullMQ + Redis (Docker) + Caddy (on_demand TLS) + Cloudflare R2 (ficheros) + Resend + Stripe + Sentry + Vitest + Playwright + Biome + pnpm 9.
Deploy: **Hetzner** (VPS/dedicado) + **Docker Compose** (§31 del blueprint).

## Architecture

### Directorios clave
- `app/marketing/` — fibraos.com público (no tenant).
- `app/platform/` — app.fibraos.com (auth global, selector org).
- `app/super-admin/` — admin.fibraos.com (equipo).
- `app/t/[tenantSlug]/` — tenants (subdominio o dominio custom). Todo accede aquí.
- `app/api/field/` — REST para PWA offline.
- `app/api/webhooks/` — Stripe, Resend, Cloudflare.
- `lib/db/schema/` — Drizzle schema dividido por dominio.
- `lib/db/queries/` — queries tipadas, incluye CTE de impacto.
- `lib/tenancy/` — resolución por hostname, `withTenantTx`.
- `lib/domains/` — abstracción `DomainProvider` + implementación Cloudflare.
- `lib/outbox/` — outbox pattern para efectos externos confiables.
- `lib/importer/` — parser Excel con mapeo flexible.
- `components/` — UI dividida por dominio (map/, box/, field/, branding/, ui/).
- `messages/es.json` — todos los strings de UI.
- `middleware.ts` — tenant → auth → i18n.

### Data flow
- **Lecturas:** Server Components consultan Drizzle dentro de `withTenantTx`. Nunca `fetch` interno.
- **Mutaciones:** Server Actions validan con Zod, llaman a `withTenantTx`, revalidan paths, publican outbox si aplica.
- **PWA offline:** Route Handlers REST bajo `/api/field/*` porque el SW debe interceptarlas.
- **Side effects externos:** siempre vía `outbox_events` + worker BullMQ.

### Patterns clave
- Server Components por defecto. `"use client"` solo para interacción o APIs del browser.
- Todo query filtra por `organization_id`. RLS como red de seguridad.
- Lint rule local bloquea `db.update/insert/delete` fuera de `withTenantTx`.
- Cada entidad con soft delete usa `WHERE deleted_at IS NULL` en todos los queries.
- IDs de recursos públicos usan `short_id` (boxes) no UUID.
- Todo texto al usuario desde `messages/es.json`.

## Code Organization Rules

1. **Un componente por fichero.** Máx 300 líneas. Si excede, extraer sub-componentes.
2. **Path alias:** `@/` para la raíz del proyecto.
3. **Sin barrel exports.** Importar del fichero fuente directamente.
4. **Server Components por defecto.**
5. **Type safety end-to-end:** schema Drizzle → tipos inferidos → Zod → Server Action → cliente. Sin duplicación manual.
6. **Server Actions en archivos colocados junto a la página** bajo `actions.ts`. No duplicar lógica entre cliente y servidor.
7. **Queries complejas en `lib/db/queries/*`**, no inline en componentes.
8. **Transacciones obligatorias para mutaciones** vía `withTenantTx`.

## Design System

### Colors
- `--brand-primary`: `#1E5FFF` (override por tenant)
- `--brand-accent`: `#0EA5E9` (override por tenant)
- Neutral scale: slate (tailwind)
- Semantics: success `#16A34A`, warning `#F59E0B`, destructive `#DC2626`
- Fiber colors: TIA-598-C (12 colores)

### Typography
- UI: Inter 400/500/600/700
- Code: JetBrains Mono 400/500
- Scale: 12/14/16/18/20/24/30/36
- Line-height: 1.5 body, 1.2 headings

### Style
- Radius: 8 (default), 12 (cards), 16 (modals), full (avatars)
- Spacing: 4px base (4/8/12/16/24/32/48/64)
- Shadows sm/md/lg
- Animations: 150ms ease-out hovers, 300ms transiciones
- Icons: lucide-react, 20px default
- Touch targets móvil ≥ 44px

## Environment Variables

Ver `.env.example`. Obligatorias en local: `DATABASE_URL`, `REDIS_URL`, `S3_*` (MinIO en dev), `AUTH_SECRET`, `NEXT_PUBLIC_ROOT_DOMAIN=fibraos.local`, `MAPTILER_API_KEY`.

## Reglas No Negociables

1. **Aislamiento multi-tenant es sagrado.** Toda query con filtro `organization_id`. RLS activo. Lint rule bloquea queries fuera de `withTenantTx`. Tests de aislamiento obligatorios.
2. **Server Actions validan con Zod y chequean rol.** Sin Zod, no hay mutación. Helper `requireRole`.
3. **Migraciones no destructivas en prod.** Añadir antes, migrar datos, luego eliminar en release posterior.
4. **Outbox para efectos externos.** Emails, webhooks salientes, llamadas a Stripe/Cloudflare fuera de síncrono se publican como eventos.
5. **UI en español via `messages/es.json`.** Código en inglés. No hardcodear strings visibles al usuario.
6. **Commits conventional** (`feat:`, `fix:`, `chore:`, `docs:`, `test:`, `refactor:`). Cada PR cita sprint y sección del blueprint.
7. **WCAG AA.** Teclado, contraste, ARIA.
8. **ADR para decisiones no triviales.** Plantilla en `docs/adr/_template.md`. Ver catálogo en blueprint §24.
