# ADR-021: Tests de integración con testcontainers

- Status: accepted
- Date: 2026-04-24
- Sprint: 9

## Contexto

El Sprint 4 introdujo `computeImpact` con un CTE recursivo que depende de
Postgres real (`recursive CTE`, `ST_GeographyFromText`, funciones PL/pgSQL
de nuestros triggers). El Sprint 3 consolidó `fn_sync_fusion_endpoints` y
`fn_set_fiber_status_on_fusion` con orden específico de triggers. Y la
RLS aplica solo sobre Postgres real — no sobre un mock.

El blueprint DoD Sprint 4 pedía "cortar troncal específico devuelve la
lista exacta de clientes colgando aguas abajo". Hasta Sprint 8 esto se
verificó manualmente; tests E2E vivieron como `test.skip`.

## Decisión

**Testcontainers** (`@testcontainers/postgresql` + `@testcontainers/redis`)
para la suite de **integración** (separada de unit).

- `vitest.integration.config.ts` con `pool: forks + singleFork`: un solo
  stack Postgres+Redis se levanta por worker y se comparte entre tests.
- `tests/integration/setup/containers.ts` arranca `postgis/postgis:16-3.4`
  + `redis:7-alpine`, aplica el schema Drizzle via `pushSchema` y ejecuta
  las migraciones SQL custom de `lib/db/migrations/sql/*`.
- `tests/integration/setup/seed-minimal.ts` crea topologías sintéticas:
  OLT → splitter 1x8 → 8 CTOs → 8 clientes, justo lo que el DoD pide.
- `pnpm test:integration` corre la suite; `pnpm test` sigue siendo solo unit.
- CI separa los jobs: `lint-typecheck-unit` (rápido) → `integration`
  (Docker-in-runner, ~3-5 min con images en caché).

### Qué cubre

- `impact.test.ts` — 4 casos del flujo 5 (cable, fibra, box, zero-case).
- `isolation.test.ts` — flujo 6 completo: RLS bloquea cross-tenant en
  SELECT/UPDATE/INSERT.
- `importer.test.ts` — flujo 2 end-to-end: dry-run no escribe, real crea,
  re-import actualiza (idempotencia por code).

## Consecuencias

- **Pros:**
  - Tests de verdad. Un fallo en `fn_set_fiber_status_on_fusion` o en
    el ordering de triggers explota en CI, no en producción.
  - RLS validada en CI contra Postgres real — la única manera fiable.
  - Reutilizable: cada nueva feature de BD añade un test sin ceremonia.

- **Cons:**
  - ~3-5 min en CI (boot del container + suite). Aceptable como gate pre-merge.
  - Docker-in-runner requiere `ubuntu-latest` (GitHub-hosted). Self-hosted
    runners sin Docker no funcionan.
  - Primer run local baja ~400MB de imagen; posteriores usan caché Docker.

## Alternativas consideradas

| Alternativa | Por qué descartada |
|---|---|
| `pg-mem` | No soporta PostGIS ni CTEs recursivas complejas. |
| Postgres en GitHub Actions `services:` | Los Services no pueden usar una imagen que no esté publicada; postgis/postgis funciona pero no encaja con el patrón Dockerfile builder de testcontainers (composición más compleja). |
| Mock del ORM | Pierde la garantía que da probar el SQL real. Inaceptable para el CTE de impacto. |
| Solo tests E2E con Playwright | Demasiado lento y frágil para probar RLS o CTE; E2E cubre flujos de UI, integración cubre datos. |
