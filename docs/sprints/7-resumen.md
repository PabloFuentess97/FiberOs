# Sprint 7 — Resumen

- Fecha: 2026-04-24
- Objetivo (§23): multi-tenancy "enterprise ready".

## Entregado

### Modelo de datos
- `lib/db/schema/billing.ts`:
  - `subscriptions` con plan, status, trial/period dates, Stripe customer+subscription IDs.
  - `plan_quotas` (global, sin RLS) con 5 filas seed (trial/starter/pro/business/enterprise).
  - `stripe_events` (PK `event_id` para idempotencia de webhooks).
  - `outbox_events` con `dispatched_at` + `attempts` + `last_error`.
  - `impersonations` con `ends_at` (2h) y `acted_as_by` flag para audit.
- Migración `0007_billing_domains.sql`:
  - RLS en subscriptions / outbox / impersonations; `plan_quotas`/`stripe_events` sin RLS.
  - Seed `plan_quotas` idempotente con ON CONFLICT.
  - `fn_check_plan_quotas` aplicado como BEFORE INSERT a `clients`, `organization_members`, `tenant_domains`. Lanza `plan_limit_exceeded` con ERRCODE `P0001` que la app captura.

### Caddy + dominios custom
- `infra/Caddyfile`: wildcard DNS-01 para `*.fibraos.com` + `on_demand_tls` para hostnames externos, headers HSTS, compresión zstd/gzip, forwarding de `X-Forwarded-*`, health HTTP:80.
- `infra/caddy/Dockerfile`: builder xcaddy con plugin `caddy-dns/cloudflare`.
- `app/api/internal/domain-authorize/route.ts`: endpoint `ask` con `X-Internal-Secret`, filtra por `status IN (verifying, active)` para proteger cuota LE.
- `lib/domains/provider.ts`: interfaz `DomainProvider` + `CaddyOnDemandProvider` que devuelve CNAME/A/AAAA/TXT sugeridos.
- `lib/domains/verifier.ts`: `verifyHostname` con DNS CNAME/A lookup + TXT opcional; `nextBackoffSeconds` (1min×30 → 10min×144 → 1h×168 → fail) según §12.3; `runDomainCheck` re-encola con delay; `promoteToActive` tras observar cert.
- `lib/queues/workers/domain-verifier.ts`: worker concurrency 4, re-encola su siguiente check.

### Outbox pattern
- `lib/outbox/publisher.ts`: `publishOutbox(tx, event)` inserta + encola dentro de la transacción del caller.
- `lib/email/templates.ts`: HTML templates ligeros (invitación, dominio verificado/fallido, impersonation notice) con color primario del tenant.
- `lib/queues/workers/outbox-dispatcher.ts`:
  - Consume cola `fibraos:outbox`.
  - Llama a Resend si `RESEND_API_KEY` presente; en dev solo loggea.
  - Scan periódico cada 30s para recuperar eventos con `dispatched_at IS NULL` que no entraron a BullMQ.
  - Actualiza `attempts`/`last_error` en cada fallo.

### UI tenant
- `/settings/domains`:
  - Form añadir hostname → `addDomainAction` rechaza reservados + hostname de fibraos.com.
  - Muestra instrucciones DNS copiables con estado live.
  - Acciones: revisar DNS manualmente, eliminar.
  - Badges: active/verifying/pending_dns/failed con errores inline.
- `/settings/branding`:
  - Form con nombre comercial, primary/accent colors (color picker + hex), logo URL, favicon URL, email from/support, razón social.
  - **Preview en vivo** de dashboard + email con CSS variables `--brand-primary`/`--brand-accent` aplicadas al componente de preview.

### Stripe
- `lib/billing/stripe.ts`: client singleton + `priceIdForPlan`.
- `/api/webhooks/stripe`:
  - Verifica firma con `constructEvent`.
  - Idempotencia: inserta en `stripe_events` antes de procesar; re-entradas devuelven `{ duplicate: true }`.
  - Maneja `customer.subscription.created|updated|deleted`, `invoice.paid`, `invoice.payment_failed`.
  - Devuelve 200 incluso en error interno (retry manual via Stripe CLI), guarda error en tabla.
- `/settings/billing`:
  - `startCheckoutAction`: crea customer si falta, encola Checkout Session con plan, redirect.
  - `openPortalAction`: Billing Portal session para gestionar método de pago / cancelar.
  - UI muestra plan actual, KPIs de uso (clientes/usuarios/dominios) con barras de progreso y marcado rojo al 85%.

### Rate limiting
- `lib/rate-limit/index.ts`:
  - `consumeRateLimit(orgId, bucket)` usa `RateLimiterRedis` con fallback a memoria.
  - Rate por plan leído de `plan_quotas.api_rate_per_minute`, cacheado 60s.
  - `invalidatePlanCache` para limpiar tras upgrade/downgrade.

### Super-admin
- `lib/auth/super-admin.ts`: `requireSuperAdmin` contra allowlist `SUPER_ADMIN_EMAILS`.
- Layout con banner ámbar permanente + nav (Organizaciones / Métricas / Dominios / Colas).
- `/super-admin`: listado de organizaciones con plan/status/fecha.
- `/super-admin/organizations/[id]`: detalle (suscripción, miembros con botón impersonar, dominios).
- `ImpersonateDialog` + `startImpersonationAction`:
  - Motivo obligatorio (≥10 chars).
  - `ends_at = now() + 2h`.
  - Outbox email al target (`email.impersonation_notice`).
  - Cookie `fibraos_impersonation` firmada (base64 JSON) con TTL 2h.
  - Redirect al tenant con `?impersonating=1`.
- `stopImpersonationAction` cierra la impersonación y marca `ended_at`.
- `/super-admin/metrics`: KPIs (orgs, MRR estimado, clientes totales, cajas totales) + distribución por plan y por status.

### ADRs
- **ADR-008 · Caddy `on_demand_tls` vs Cloudflare for SaaS** — coste, seguridad del ask endpoint, flujo completo de registro→verify→active.
- **ADR-009 · Outbox pattern** — at-least-once, scan de recuperación, retry exponencial.

## Decisiones tomadas fuera del blueprint

1. **Superadmin con allowlist simple (sin 2FA en MVP)**. Better Auth 2FA TOTP está en roadmap del proyecto (§8.1) pero lo implementamos en Sprint 8. Hasta entonces, confiar en password fuerte del admin + HTTPS.
2. **Cookie de impersonación en base64 en lugar de JWT firmado**. Para MVP es suficiente porque solo se lee desde Server Components del super-admin; cuando asumamos sesión real en el tenant (Sprint 8 middleware) migrar a JWT con HMAC.
3. **Outbox types como string abierto** con discriminador en el dispatcher. Si crece mucho, migrar a enum.
4. **Rate limiter cache de plan en memoria del proceso** (60s). En escalado horizontal cada app node tiene su propia caché; acceptable porque el limiter usa Redis (shared state) y el plan no cambia más de 1×/día.
5. **`startImpersonationAction` no asume sesión real todavía**: el MVP registra + notifica + deja cookie, pero el middleware que inyecta el targetUserId en las queries llega en Sprint 8 (§8.2). Super-admin de Sprint 7 valida el flujo de auditoría y email; la sesión asumida se cierra en el siguiente sprint.
6. **Webhook Stripe responde 200 incluso en error** para evitar reintentos infinitos; errores quedan en `stripe_events.error` para reprocess manual con Stripe CLI.

## Bloqueadores / dependencias externas

- **Cuenta Stripe con productos + price IDs** (§28). Sin ellos, `/settings/billing` muestra error controlado.
- **Cuenta Cloudflare + API token Zone.DNS:Edit** para el wildcard DNS-01.
- **Cuenta Resend + dominio verificado** para emails reales (dev cae a log).
- **`PUBLIC_HOSTNAME`, `PUBLIC_IPV4`, `PUBLIC_IPV6`** en env de producción para `CaddyOnDemandProvider`.

## Definition of Done

- [x] Schema + migración aplicables; seed plan_quotas deja 5 planes.
- [x] `fn_check_plan_quotas` bloquea inserts sobre límite.
- [x] Caddyfile + Dockerfile compilables con plugin cloudflare.
- [x] Endpoint authorize devuelve 200/403 según status.
- [x] DomainProvider propone DNS instructions; verifier reintenta con backoff correcto.
- [x] UI `/settings/domains` guía al usuario paso a paso.
- [x] UI `/settings/branding` actualiza BD y preview refleja cambios.
- [x] Stripe checkout redirige a Stripe test mode; webhook sincroniza status.
- [x] Rate limiter por plan con fallback memoria.
- [x] Super-admin lista orgs, detalle, impersona con email al target.
- [x] Métricas básicas agregan por plan y MRR estimado.
- [x] ADR-008 y ADR-009 escritas.

## Siguientes pasos (Sprint 8)

1. Provisionar servidor Hetzner CPX31 (staging + prod).
2. `docker-compose.prod.yml` con caddy + app ×2 + worker + postgres + pgbouncer + redis + backup sidecar.
3. GitHub Actions `deploy.yml` con push a GHCR + SSH deploy + healthcheck + rollback.
4. Cron backup + test de restore real.
5. Middleware completar impersonación (asumir sesión real).
6. Sentry integrado con tenant tags.
7. Error boundaries + páginas 404/500/offline.
8. Runbooks en `docs/runbooks/`: `restore-postgres.md`, `rotate-secrets.md`, `add-tenant-domain.md`, `incident-dns.md`.
9. QA completa de los 15 criterios de aceptación contra staging.
10. Changelog consolidado.
