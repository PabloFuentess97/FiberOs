# ADR-010: PgBouncer en modo `session` delante de Postgres

- Status: accepted
- Date: 2026-04-23
- Sprint: 1

## Contexto

FibraOS usa `SET LOCAL app.organization_id` y `app.user_id` al inicio de cada transacción
para alimentar RLS (ADR-002) y el trigger de auditoría. En PgBouncer modo `transaction`,
la conexión se devuelve al pool entre statements y `SET LOCAL` se pierde entre queries.

## Decisión

PgBouncer corre con `POOL_MODE=session` en `docker-compose.prod.yml`:

```
POOL_MODE=session
MAX_CLIENT_CONN=500
DEFAULT_POOL_SIZE=50
```

El driver `postgres` (postgres.js) se configura con `prepare: false` para evitar el único
caso edge donde session-mode + prepared statements + múltiples conexiones del mismo pool
puede producir errores "prepared statement already exists".

Todas las mutaciones se envuelven en `db.transaction(...)` vía `withTenantTx` (`lib/tenancy/context.ts`)
de manera que `SET LOCAL` solo vive dentro de la transacción, que es exactamente cuando
se necesita.

## Consecuencias

- **Pros:**
  - RLS funciona de manera transparente sin reescribir cada query.
  - Auditoría automática vía trigger lee `current_setting('app.user_id')` sin hacks.
  - Compatible con Drizzle y con pg-mem para tests.

- **Cons / trade-offs:**
  - Session-mode usa más conexiones a Postgres que transaction-mode. Mitigado con `DEFAULT_POOL_SIZE=50` y `max_connections=200` en Postgres.
  - `prepare: false` cuesta un hash extra por query. Irrelevante a nuestro volumen MVP.

## Alternativas consideradas

| Alternativa | Por qué descartada |
|---|---|
| Transaction mode + `SET` sin `LOCAL` | Fuga de contexto entre tenants si una conexión se reusa mal. Inaceptable. |
| Transaction mode + parametrizar RLS en la query | Performance razonable pero obliga a cada query a añadir filtros redundantes con RLS; el punto del `SET LOCAL` es evitar esa duplicación. |
| Sin pooler | Dev está bien; prod saturaría Postgres con conexiones de varios contenedores app+worker. |
