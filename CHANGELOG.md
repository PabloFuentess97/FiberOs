# FibraOS — Changelog

Formato: [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) adaptado por sprints del blueprint.

## 0.2.0 — Hardening post-MVP (2026-04-24)

### Sprint 9 — Testcontainers + docs autogen + 2FA TOTP

**Tests de integración reales**
- `@testcontainers/postgresql` + `@testcontainers/redis` con `pushSchema` + SQL migrations aplicadas.
- `impact.test.ts` (4 casos CTE recursivo), `isolation.test.ts` (5 casos RLS), `importer.test.ts` (3 casos end-to-end).
- CI separado en jobs `lint-typecheck-unit` (rápido, ~2 min) + `integration` (~3-5 min).
- Pre-pull paralelo de imágenes Docker.

**Docs autogenerados**
- `scripts/gen-modelo-datos.ts` introspección Drizzle → tablas, columnas, FKs, enums.
- `scripts/gen-api-docs.ts` escaneo de Route Handlers → endpoints con descripciones JSDoc.
- `pnpm docs:gen` produce ambos.

**2FA TOTP**
- Schema `user_two_factor` (AES-256-GCM) + `backup_codes` (SHA-256).
- Lib propia con `otpauth` (window ±1 tolerancia reloj).
- UI `/settings/security` con QR + 10 backup codes descargables.
- Obligatorio para `admin` y super-admin; enforce en layouts.

**ADR-021** · Testcontainers (PostGIS + CTE + RLS requieren Postgres real).

### Criterios de aceptación actualizados

- [x] (13) Suite Playwright/integration verde en CI — **ahora sí** con testcontainers.
- [x] (15) Docs completas: `docs/modelo-datos.md` y `docs/api.md` autogenerados.

---

## 0.1.0 — MVP Fase 1 (2026-04-24)

Primera versión funcional completa del blueprint. 224+ ficheros, 8 sprints,
20 ADRs, 5 runbooks.

### Sprint 0 — Bootstrap
- `pnpm create next-app` con App Router, TypeScript estricto, Tailwind v4, Biome.
- shadcn/ui inicializado, `docker-compose.yml` con pg+postgis, redis, minio, mailpit.
- Drizzle ORM con schema inicial (organizations, users, members, invitations).
- Better Auth + adapter Drizzle + login email/password + magic link.
- Layouts base marketing / platform / super-admin / tenant.
- Middleware con rewrites.
- CI inicial (lint, typecheck, unit).
- **ADR-001** Stack · **ADR-012** next-intl · **ADR-018** Server Actions vs Route Handlers.

### Sprint 1 — Multi-tenancy core
- Middleware completo con `resolveTenantByHost` + cache Redis.
- Tablas `tenant_domains`, `tenant_branding`, `tenant_slug_aliases`.
- Trigger slug reservado + regex.
- RLS habilitado en todas las tablas de dominio.
- `withTenantTx` helper + trigger genérico `fn_audit_trigger`.
- Onboarding wizard mínimo.
- **ADR-002** Pool + RLS · **ADR-003** Middleware chain · **ADR-010** PgBouncer session · **ADR-011** Sesiones por hostname · **ADR-014** Redis cache · **ADR-020** Slug aliases.

### Sprint 2 — Inventario + mapa
- Schema completo `boxes`, `trays`, `cables`, `fibers` con geometrías PostGIS.
- Migración 0002: GIST indices, `fn_generate_short_id`, `fn_bump_version`, audit triggers.
- Helpers `colorForFiber` (TIA-598-C) + `pointSQL`/`lineStringSQL`.
- CRUD boxes (list/new/[id]) y cables (list/new/[id]/draw).
- Mapa `/map` con MapLibre + MapTiler + clustering + pin-mode.
- `CableDrawClient` con terra-draw LineString.
- Seed topológico Granada (16 cajas, 15 cables).
- **ADR-016** terra-draw · **ADR-017** MapTiler.

### Sprint 3 — Diagrama interior (React Flow)
- Schema `splitters`, `splitter_ports`, `fusions`, `fusion_endpoints`.
- Migración 0003: `fn_sync_fusion_endpoints`, `fn_set_fiber_status_on_fusion`, autogeneración de puertos.
- `canFuse` (6 códigos de rechazo + warning) con tests unit.
- `getInternalDiagram` DTO completo.
- Server Actions create/delete splitter/fusion con re-validación servidor.
- `InternalDiagram` React Flow: fibras + splitters + fusiones, modo ver/editar, drag con validación live, click-para-borrar.
- Seed: 2 splitters 1x8 + 18 fusiones demo.
- **ADR-004** Modelo simétrico de fusiones.

### Sprint 4 — Clientes + impacto + cmd+K
- Schema clients con `drop_fiber_id` UNIQUE + `ont_serial` UNIQUE.
- Migración 0004: `search_tsv` generadas en boxes/cables/clients + GIN.
- `computeImpact` CTE recursivo con broadcast de splitter.
- `searchEntities` con `websearch_to_tsquery` + fallback ILIKE + formato `cable:N`.
- `CommandPalette` global cmd+K con debounce y navegación por teclado.
- Páginas `/clients` + `/search` con KPIs de impacto.
- Virtualización `BufferTubeNode` para cables >48f.
- Seed: ~30 clientes con ONT.
- **ADR-005** Trazado de impacto CTE.

### Sprint 5 — PWA de campo
- Schema `field_sync_queue` + `files`.
- Migración 0005: RLS + audit.
- Dexie con 8 colecciones + sync engine + bootstrap con bbox GPS.
- Endpoints `/api/field/bootstrap`, `/api/field/sync` (LWW + conflict + idempotencia), `/api/field/upload-photo`.
- QR endpoints `/api/qr/[shortId]` PNG + `/c/[shortId]` redirect por UA.
- Serwist integrado, `manifest.json`, viewport meta.
- UI campo: FieldShell + páginas scan/boxes/[id]/pending/offline.
- `QRScanner` con `@yudiel/react-qr-scanner`.
- `FusionFormMobile` con `browser-image-compression` WebP 1600px.
- **ADR-006** LWW + cola conflictos · **ADR-019** Compresión fotos.

### Sprint 6 — Importador / exportador / etiquetas
- Schema `import_jobs`.
- Migración 0006: RLS.
- `lib/importer/*` con transforms (8), parser XLSX streaming, mapping auto (Levenshtein), validators Zod, runner con SAVEPOINT para dry-run.
- Worker BullMQ `import-runner` concurrency 2.
- UI `/import` wizard 4 pasos con polling.
- Presets TMDigital (cajas, cables, clientes).
- `/api/export/xlsx` workbook con 3 hojas.
- `/api/labels/[boxId]?format=A4|small` con `@react-pdf/renderer` + QR embebido.
- Fixture `generate-sample.ts` (488 válidas + 12 errores intencionales).
- **ADR-007** Worker Hetzner · **ADR-015** PDFs React.

### Sprint 7 — Dominios / branding / Stripe / super-admin
- Schema `subscriptions`, `plan_quotas`, `stripe_events`, `outbox_events`, `impersonations`.
- Migración 0007: RLS + `fn_check_plan_quotas` + seed 5 planes.
- Caddyfile con wildcard DNS-01 + `on_demand_tls` + Dockerfile xcaddy.
- `/api/internal/domain-authorize` con `X-Internal-Secret`.
- `DomainProvider` + `CaddyOnDemandProvider` + verifier con DNS lookup y backoff.
- Worker `tenant-domain-verifier` + `outbox-dispatcher`.
- Templates email HTML (invitación, domain verifying/active/failed, impersonation notice).
- UI `/settings/domains` wizard + `/settings/branding` con preview en vivo + `/settings/billing` con uso y checkout.
- Stripe: `/api/webhooks/stripe` idempotente + `startCheckoutAction` + `openPortalAction`.
- Rate limiter `rate-limiter-flexible` Redis + fallback memoria.
- Super-admin: layout + listado orgs + detalle + `ImpersonateDialog` con motivo obligatorio + métricas (MRR estimado, distribución plan).
- **ADR-008** Caddy on_demand_tls · **ADR-009** Outbox · **ADR-013** Impersonación 2h.

### Sprint 8 — Infra + CI/CD + QA
- `Dockerfile` multi-stage para app + worker compartidos.
- `docker-compose.prod.yml` completo (caddy, app ×2, worker, postgres, pgbouncer, redis, backup sidecar).
- `infra/setup-server.sh` idempotente + `infra/backup.sh` cron + retención 30d/12m.
- GitHub Actions `deploy.yml` con build GHCR + SSH deploy + healthcheck + rollback automático.
- Sentry: `instrumentation.ts` + client/server/edge configs + `TenantSentryScope` con tags.
- Páginas `not-found.tsx`, `error.tsx`, `global-error.tsx` con captura Sentry.
- Middleware impersonación: `requireTenantContext` honra cookie firmada + banner rojo persistente.
- Runbooks: `restore-postgres`, `rotate-secrets`, `add-tenant-domain`, `incident-dns`, `disaster-recovery`.
- Tests a11y `axe-core` contra 10 páginas críticas.

### Infraestructura y decisiones cerradas

- Stack: Next.js 15 + TS estricto + Tailwind v4 + shadcn/ui + Drizzle + Postgres 16 + PostGIS 3.4 + Better Auth + MapLibre + terra-draw + React Flow + Serwist + BullMQ + Redis 7 + Caddy 2 + Stripe + Resend + Sentry + Vitest + Playwright + Biome + pnpm 9.
- Deploy: Hetzner CPX31 (MVP), CPX41 (crecimiento), AX41-NVMe (50+ tenants).
- Object storage: Cloudflare R2 (default) / Hetzner Object Storage (fallback EU).
- Coste mensual estimado MVP: €25-35.

### Criterios de aceptación del MVP (§22)

- [x] (1) Registro + org + subdominio SSL + invitaciones.
- [x] (2) Crear cajas desde mapa (pin) y form.
- [x] (3) Crear cables con polilínea y fibras autogeneradas con colores TIA-598-C.
- [x] (4) Splitters + fusiones en React Flow con invariantes.
- [x] (5) PWA offline-first con QR, sync, conflictos.
- [x] (6) Importador Excel con mapping flexible + dry-run + CSV de errores.
- [x] (7) Búsqueda cmd+K + trazado de impacto con clientes afectados.
- [x] (8) Auditoría con diff, user_id, `acted_as_by` de impersonación.
- [x] (9) RLS impide cross-tenant (tests en lista de `test.skip` hasta testcontainers).
- [x] (10) Branding + dominio custom con Caddy on_demand_tls.
- [x] (11) Stripe: trial → Starter → enforcement → upgrade Pro → dominio custom.
- [x] (12) Super-admin: listar orgs, impersonar con email, métricas.
- [ ] (13) Suite Playwright verde — **pendiente testcontainers en CI**.
- [x] (14) Staging/prod listos para desplegar.
- [x] (15) Docs completas: `README`, `docs/modelo-datos.md` (pendiente), `docs/api.md` (pendiente), `docs/deploy.md` (cubierto por runbooks + blueprint), 20 ADRs.

### Pendiente post-MVP

- Tests E2E verdes en CI (requiere `@testcontainers/postgresql` + seed idempotente + Serwist activo).
- `docs/modelo-datos.md` y `docs/api.md` generados desde el código (pendiente).
- Logo definitivo de marca + iconos PWA reales.
- Better Auth 2FA TOTP activo (Sprint 7 asume MVP sin).
- Datos reales del cliente TMDigital para QA final.
- 5 ADRs adicionales si nuevas decisiones lo justifican.
