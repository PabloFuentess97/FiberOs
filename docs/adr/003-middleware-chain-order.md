# ADR-003: Orden de middleware: tenant → auth → i18n

- Status: accepted
- Date: 2026-04-23
- Sprint: 1

## Contexto

Cada petición HTTP debe pasar por tres fases: identificación del tenant por hostname,
autorización de la sesión y selección del idioma. El orden importa porque la información
producida por cada fase alimenta a la siguiente.

## Decisión

En `middleware.ts`, las fases se ejecutan en este orden:

1. **Tenant resolver** (`resolveTenantByHost`):
   - Lee `Host` header.
   - Rewrites estáticos para `fibraos.com`, `www`, `app`, `admin`.
   - Para subdominios: valida contra lista reservada; si no es reservado, resuelve vía BD + cache Redis (TTL 60s).
   - Para dominios custom: resuelve por `tenant_domains.hostname`.
   - Inyecta headers `x-tenant-id`, `x-tenant-slug`, `x-host-kind`.

2. **Auth guard** (delegado a layouts en Server Components — Sprint 1):
   - Las rutas tenant (`app/t/[tenantSlug]/**`) redirigen a `app.{root}/login?next=...` si no hay sesión.
   - Las rutas super-admin verifican allowlist + 2FA (Sprint 7).

3. **i18n** (`next-intl`):
   - Actualmente fijado a `es`. Preparado para `pt`, `en` sin refactor (ADR-012).
   - Se ejecuta solo sobre paths bajo `/t/[tenantSlug]/` donde el contenido del producto es traducible.

**Runtime Node.js** para middleware (`nodeMiddleware: true` en `next.config.ts`):
ioredis y la conexión Drizzle no son edge-compatibles y `resolveTenantByHost` necesita ambas.

## Consecuencias

- **Pros:**
  - El rewrite ocurre antes que cualquier lógica de app, así los layouts leen `params.tenantSlug` confiable.
  - Cache Redis con TTL 60s + invalidación explícita mantiene latencia <5ms en la mayoría de peticiones.
  - Delegar auth guard a layouts simplifica el middleware (evita duplicar lógica de Better Auth).

- **Cons / trade-offs:**
  - `nodeMiddleware` es experimental en Next 15. Vigilar changelog; fallback plan: mover la resolución a un pre-layout server component si Vercel lo retira.
  - Cada petición hace al menos una query a Redis. En prod self-hosted esto es trivial (Redis en red docker interna); en serverless sería una penalización.

## Alternativas consideradas

| Alternativa | Por qué descartada |
|---|---|
| Auth antes que tenant | Imposible: sin tenant no sabemos qué cookie domain leer ni qué hostname es válido para la sesión. |
| Edge middleware + Upstash Redis HTTP | Menos simple (requiere cuenta Upstash además del Redis dockerizado). Se mantiene como ruta de migración futura si el hosting cambia. |
| Middleware más fino: solo rewrites; resolución en layout | Introduce round-trip duplicado (capa rewrite decide `/t/[slug]` pero `slug` no está verificado contra BD). Genera sensación de 404 tardío. |
| Sin cache, solo BD | Postgres aguanta, pero 1 query por petición vs 1 HSET cada 60s es desperdicio. |
