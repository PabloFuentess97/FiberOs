# ADR-002: Pool tenancy + RLS como doble cinturón

- Status: accepted
- Date: 2026-04-23
- Sprint: 1

## Contexto

FibraOS comparte una única base de datos Postgres entre todos los tenants (modelo pool).
Hay dos líneas de defensa contra fuga de datos entre organizaciones:

1. Aplicación: toda query filtra por `organization_id`.
2. Base de datos: Row Level Security con política `organization_id = current_setting('app.organization_id')::uuid`.

Si la aplicación olvida filtrar, RLS aún bloquea. Si RLS se deshabilita por accidente, el filtro de la app sigue protegiendo.

## Decisión

- RLS activo en todas las tablas con `organization_id` (en Sprint 1: `tenant_domains`, `tenant_branding`, `invitations`, `audit_log`; Sprints 2–4 añaden `boxes`, `cables`, `fibers`, `splitters`, `fusions`, `clients`).
- El rol de conexión de la app **no** tiene `BYPASSRLS`.
- Super-admin usa un rol separado con `BYPASSRLS` activado únicamente cuando impersona o consulta métricas globales.
- Toda mutación se ejecuta en `db.transaction()` con `SET LOCAL app.organization_id` y `app.user_id` via `withTenantTx` (`lib/tenancy/context.ts`).
- PgBouncer se configura en **session** pool mode — crítico, porque en transaction-mode el `SET LOCAL` se pierde entre statements.
- Un lint rule local (pendiente de implementar en Sprint 2) bloqueará `db.update/insert/delete` fuera de `withTenantTx`.

## Consecuencias

- **Pros:**
  - Defensa en profundidad: un bug en la app no produce fuga entre tenants.
  - Testable directamente: integración puede ejecutar `SET LOCAL app.organization_id = org1` y verificar que no ve org2.
  - Mismo Postgres, costes de operación bajos.

- **Cons / trade-offs:**
  - Session pool limita concurrencia efectiva. Mitigado con `MAX_CLIENT_CONN=500` y `DEFAULT_POOL_SIZE=50` en PgBouncer.
  - Requiere disciplina de desarrollo para no olvidar `withTenantTx`. El lint rule lo fuerza.
  - Queries que cruzan tenants (super-admin) requieren un cliente DB separado con BYPASSRLS. Se gestiona en `lib/db/admin.ts` (Sprint 7).

## Alternativas consideradas

| Alternativa | Por qué descartada |
|---|---|
| Schema por tenant | Complica migraciones, backups y super-admin. No escala bien con cientos de tenants. |
| BD por tenant | Overhead operativo enorme. Valdría para Enterprise tier, fuera del MVP. |
| Solo filtro en app | Un bug produce fuga inmediata. Políticas RLS son red de seguridad barata. |
| Solo RLS sin filtro en app | RLS añade coste a cada query y sin el filtro explícito en app la intención se vuelve opaca. |
