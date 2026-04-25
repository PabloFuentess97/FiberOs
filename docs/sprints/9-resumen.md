# Sprint 9 — Resumen (post-MVP hardening)

- Fecha: 2026-04-24
- Objetivo: cerrar los 4 bloqueadores post-MVP listados en CHANGELOG 0.1.0
  - Tests E2E verdes con testcontainers.
  - Docs `modelo-datos.md` / `api.md` autogenerados.
  - 2FA TOTP obligatorio para admin y super-admin.
  - Preparación para feedback de producción real.

## Entregado

### Tests de integración reales
- `@testcontainers/postgresql` + `@testcontainers/redis` en `devDependencies`.
- `tests/integration/setup/containers.ts`:
  - Levanta `postgis/postgis:16-3.4` + `redis:7-alpine`.
  - Aplica schema Drizzle via `pushSchema` + todas las SQL de `lib/db/migrations/sql/*`.
  - Inyecta env vars (`DATABASE_URL`, `REDIS_URL`, `AUTH_SECRET`, `NEXT_PUBLIC_ROOT_DOMAIN`, `INTERNAL_API_SECRET`, `SUPER_ADMIN_EMAILS`).
  - Helper `withTenant` para transacciones con `SET LOCAL`.
- `tests/integration/setup/seed-minimal.ts` — topología canónica (§10.3): OLT → CBL-TRUNK (96f) + CBL-INPUT (fusión input) → SPL-A 1x8 → 8 outputs → 8 CTOs → 8 clientes con drop_fiber_id.
- `vitest.integration.config.ts`: `pool: forks + singleFork` para compartir stack entre tests, timeout 120s.

### Tests de integración
- **`impact.test.ts`** (4 casos): cortar input-fiber del splitter devuelve 8 clientes (broadcast); cortar output individual devuelve 1; cortar cable troncal sin fusiones a splitter devuelve 0 clientes; entrada `box` alcanza los 8.
- **`isolation.test.ts`** (5 casos): RLS bloquea cross-tenant en SELECT/UPDATE/INSERT; WITH CHECK rechaza insert con `organization_id` ajeno.
- **`importer.test.ts`** (3 casos): dry-run no escribe; ejecución real crea 5 + error 2 → `status=partial`; re-import actualiza sin duplicar (idempotencia).

### CI actualizado
- `.github/workflows/ci.yml` ahora tiene 2 jobs:
  - `lint-typecheck-unit` (rápido, ~2 min).
  - `integration` (testcontainers, ~3-5 min). Pre-pull paraleliza imágenes con el install de pnpm.

### Docs autogenerados
- `scripts/gen-modelo-datos.ts`: introspección de Drizzle (`getTableConfig`, `isPgEnum`) → `docs/modelo-datos.md` con tabla por cada schema, columnas (tipo, null, pk, default, fk), índices, unique constraints, checks. Lista de enums con sus valores.
- `scripts/gen-api-docs.ts`: escaneo regex de `app/api/**/route.ts`, detecta verbos HTTP exportados + descripción del JSDoc → `docs/api.md` agrupado por prefijo.
- `pnpm docs:gen` ejecuta ambos.

### 2FA TOTP
- Schema `lib/db/schema/two-factor.ts` con `user_two_factor` (secret cifrado AES-256-GCM) + `backup_codes` (SHA-256 hash).
- Migración `0009_two_factor.sql` con audit triggers.
- `lib/auth/two-factor.ts`:
  - `beginEnrollment`: genera secret (20 bytes base32), cifra, devuelve `otpauthUrl` para QR.
  - `verifyCode`: valida con `otpauth` TOTP window ±1 (tolerancia reloj). Primera verificación marca `verifiedAt` + genera 10 backup codes.
  - `regenerateBackupCodes`: invalida los existentes, genera 10 nuevos.
  - `consumeBackupCode`: single-use.
  - `disableTwoFactor`: requiere código vigente (Server Action valida antes).
- UI `/settings/security`:
  - Página con estados: idle / started (QR + secret) / verified (backup codes) / active.
  - QR generado via `api.qrserver.com` (sin añadir dep de QR en cliente).
  - Backup codes descargables como `.txt`.
  - Desactivación requiere código TOTP actual.
- Enforce:
  - `lib/auth/enforce-2fa.ts` — rol `admin` obligatorio; `superAdminNeeds2FA`.
  - Dashboard layout redirige a `/settings/security?required=1` si admin no tiene 2FA.
  - Super-admin layout exige 2FA antes de servir el panel.

### ADR-021 · Testcontainers
Documenta por qué testcontainers vs pg-mem vs GitHub services: PostGIS + CTE recursivo + RLS solo se prueban contra Postgres real.

## Decisiones tomadas fuera del blueprint

1. **Super-admin siempre requiere 2FA** (más estricto que el blueprint §8.1 que lo marca como recomendado). Dada la superficie de riesgo (impersonar cualquier tenant), el trade-off de una fricción más al login vale la pena.
2. **Admin de tenant requiere 2FA; manager/technician/viewer no**. Coincide con §8.1 del blueprint. Los roles no-admin pueden activarlo opcional desde `/settings/security`.
3. **QR code via servicio externo** (`api.qrserver.com`) para no arrastrar `qrcode` al bundle cliente. En producción podemos mover a `/api/qr-otp` si preferimos sin terceros.
4. **Backup codes en SHA-256 sin salt**. Los códigos son aleatorios 10 hex chars (40 bits de entropía); SHA-256 sin salt es aceptable contra rainbow tables dado el espacio de búsqueda. No son passwords de usuario.
5. **`AES-256-GCM` con una sola clave** (`TWO_FACTOR_ENCRYPTION_KEY`). Rotación descrita en runbook de rotate-secrets — dado que el seed base32 se regenera al rotar, los usuarios re-enrollan (1 click). Acceptable.
6. **Integration tests comparten stack** (`singleFork`): si un test contamina la BD con una fila que el siguiente espera limpia, falla. Mitigamos con orgs/users distintos por suite, pero nota: si crecemos mucho, migrar a `truncate` entre tests o crear containers por archivo.
7. **`pnpm docs:gen` no se ejecuta en CI por ahora**. Idealmente el pipeline regenera docs al mergear a main y committea; lo dejamos manual en Sprint 9 para no introducir bots automáticos con permisos de write en el repo.

## Bloqueadores / dependencias externas

- `TWO_FACTOR_ENCRYPTION_KEY` obligatorio en `.env.production`: `openssl rand -hex 32`.
- Añadido a runbook `rotate-secrets.md` (Sprint 8).

## Definition of Done

- [x] Tests de integración verdes para impact CTE, aislamiento RLS e importer.
- [x] CI corre integration tras unit y falla si alguna regresión toca la BD.
- [x] `pnpm docs:gen` produce `docs/modelo-datos.md` + `docs/api.md` consistentes con el código.
- [x] 2FA TOTP enrolable desde `/settings/security` con QR + backup codes.
- [x] Super-admin bloqueado sin 2FA activo.
- [x] Admin de tenant redirigido a security al intentar operar sin 2FA.
- [x] ADR-021 escrita.

## Siguientes pasos reales (Sprint 10+)

Tras piloto con TMDigital:

1. Fixes de bugs reportados en producción.
2. Métricas Lighthouse ≥90 tras uso real (ajustes basados en datos, no en suposiciones).
3. Datos anonimizados de TMDigital en el fixture de imports (actualmente sintético).
4. 2FA WebAuthn además de TOTP (más resistente a phishing).
5. Better Auth official 2FA plugin migrar (actualmente lib propia).
6. Post-mortems de los primeros 30 días de operación.
7. Docs de operación iteradas con feedback del equipo de soporte.

---

**MVP cerrado + hardening Sprint 9 completo.** El producto está listo para
el piloto con TMDigital. Lo que venga en Sprint 10+ será reactivo al uso real.
