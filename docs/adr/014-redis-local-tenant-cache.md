# ADR-014: Tenant cache en Redis local del compose (vs Upstash/Edge Config)

- Status: accepted
- Date: 2026-04-23
- Sprint: 1

## Contexto

`resolveTenantByHost` debe ejecutarse en el path crítico de cada petición que acceda a un
tenant. La latencia debe ser sub-10ms para no penalizar Time To First Byte. El blueprint
original proponía Upstash Redis (HTTP). El cambio a self-hosted sobre Hetzner permite usar
la misma instancia Redis que BullMQ y el rate-limiter.

## Decisión

- Redis (docker) cachea mapeos `host → { id, slug, name, hostname, kind }` con TTL 60s.
- Clave: `tenant:host:{hostname}`.
- Miss positivo: se cachea también el "no encontrado" como valor `__null__` para evitar martillar Postgres con DNS probes o escaneos.
- Invalidación explícita en mutaciones que cambian el mapping: añadir/eliminar dominio, cambio de slug, cambio de status a `failed`/`disabled`.
- Middleware corre en runtime Node.js (ADR-003) para poder usar `ioredis`.

## Consecuencias

- **Pros:**
  - Latencia red docker interna < 1 ms.
  - Cero coste adicional por mes.
  - Mismo stack que BullMQ; una sola responsabilidad operativa.

- **Cons / trade-offs:**
  - No hay replicación geográfica. Si el servidor cae, todo el SaaS cae: pero es self-hosted unificado, así que esto es inherente a la decisión global.
  - Si migramos a múltiples nodos (§31.11), Redis deberá ser un servicio compartido o cada nodo tendrá su propio caché con posibles 60s de desincronización. Aceptable.

## Alternativas consideradas

| Alternativa | Por qué descartada |
|---|---|
| Upstash Redis (HTTP) | Coste extra y latencia 10–30ms adicional sin beneficio en el modelo self-hosted. |
| Edge Config (Vercel) | Lock-in con Vercel que contradice ADR-001. |
| In-memory LRU por proceso | No sobrevive redeploy ni se invalida cross-replica. |
| Postgres direct (sin cache) | ~5ms por petición aceptable pero innecesario cuando Redis está ahí. |
