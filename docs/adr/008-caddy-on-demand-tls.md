# ADR-008: Caddy `on_demand_tls` vs Cloudflare for SaaS

- Status: accepted
- Date: 2026-04-24
- Sprint: 7

## Contexto

Los tenants Pro+ pueden usar su propio hostname (p.ej. `red.tmdigital.es`).
Emitir certificados SSL válidos para cada uno requiere infraestructura de
ACME. Dos caminos principales:

1. **Cloudflare for SaaS**: API managed, custom hostnames con SSL propagado
   a toda la red de CF. Coste ~$2/hostname/mes.
2. **Caddy 2 con `on_demand_tls`**: Caddy pide cert a Let's Encrypt la
   primera vez que llega una request al hostname, tras validación via DNS.

El blueprint (§12.3) decide self-hosted. ADR confirma y documenta el flujo.

## Decisión

**Caddy 2 + `on_demand_tls` con ask endpoint** + wildcard DNS-01 para
`*.fibraos.com`.

### Arquitectura (§31 blueprint)

```
Internet
   │
   ▼
Caddy (puerto 443)
   │
   ├─ *.fibraos.com     → wildcard LE vía DNS-01 Cloudflare
   ├─ red.tmdigital.es  → on_demand_tls (HTTP-01)
   │                       ↑
   │              ask: GET https://app.fibraos.com/api/internal/domain-authorize?domain=...
   │                       Header X-Internal-Secret
   │                       → 200 si status IN (verifying, active)
   │                       → 403 en caso contrario (evita abuso LE)
   ▼
app:3000 (Next.js)
```

### Flujo completo para dominio custom

1. Tenant añade `red.tmdigital.es` desde `/settings/domains`.
2. `addDomainAction` inserta en `tenant_domains` con `status=pending_dns` + `verification_token`.
3. UI muestra CNAME/A/TXT a configurar.
4. Worker `tenant-domain-verifier` hace DNS lookup cada 1 min → 10 min → 1h (backoff §12.3).
5. Cuando resuelve OK → `status=verifying` + outbox `email.domain_verifying`.
6. Primera request HTTPS al hostname → Caddy llama al `ask` endpoint.
7. Nuestro endpoint valida status y devuelve 200 → Caddy pide cert a LE via HTTP-01.
8. Tras emitir cert con éxito, endpoint separado (o el propio worker) promociona a `active` + outbox `email.domain_active`.
9. Renovación LE al 66% de vida del cert (automática de Caddy).

### Seguridad

- `X-Internal-Secret` en el ask endpoint impide peticiones externas.
- Verificación DNS **obligatoria antes** del ask: sin esto, un atacante
  apunta su DNS a nuestro servidor y consume nuestra cuota LE (5 fallos
  por hostname/h, 50 certs/semana por dominio raíz).
- Filtramos por `status IN (verifying, active)` en BD → solo dominios ya
  validados llegan a LE.

## Consecuencias

- **Pros:**
  - **Coste**: cero por hostname (vs $2/mes × N en Cloudflare for SaaS).
    Con 100 tenants Pro+ ahorramos $200/mes.
  - Sin dependencia de Cloudflare plan Business (que Cloudflare for SaaS requiere).
  - Control total: podemos emitir cert con cualquier CA (LE ahora, ZeroSSL
    fallback) sin cambiar de proveedor.
  - Renovación automática sin intervención humana.

- **Cons / trade-offs:**
  - **Responsabilidad operativa**: si Caddy cae, dominios custom dejan de
    servirse. Mitigación: health checks + snapshots semanales + runbook.
  - **Rate limits LE** globales de nuestro server: 300 New Orders/3h; con
    100+ onboards simultáneos podríamos saturar. Monitorear con alerta.
  - **Cache en memoria de Caddy**: si el ask endpoint cambia su respuesta
    (revocamos un dominio), Caddy respeta el `interval 2m` antes de preguntar
    otra vez. Para revocación inmediata, llamar a Caddy admin API.
  - **Plugin `caddy-dns/cloudflare`** requiere imagen custom con xcaddy
    (documentado en `infra/caddy/Dockerfile`).

## Alternativas consideradas

| Alternativa | Por qué descartada |
|---|---|
| Cloudflare for SaaS | $2+/hostname/mes; requiere CF Business plan; vendor lock-in. |
| Vercel + `vercel.app` | Solo apps Vercel; no sirve para self-hosted. |
| Nginx + certbot por hostname | No hay equivalente out-of-the-box de `on_demand_tls`; construirlo a mano es frágil. |
| Traefik con Let's Encrypt | Válido, pero Caddy es más declarativo y su `on_demand_tls` nació para este caso exacto. |
| Subdominios solo (sin custom domains) | Contradice requisito del cliente (TMDigital quiere `red.tmdigital.es`). |
| Let's Encrypt wildcard global `*.anything` | Imposible: LE no emite wildcards cross-domain. |
