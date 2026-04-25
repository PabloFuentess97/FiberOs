# Runbook · Incidente DNS

**Severidad**: alta si `*.fibraos.com` falla (todos los tenants caídos).

## Triage inicial (5 min)

```bash
# ¿Responde el servidor?
ping saas.fibraos.com
curl -fsS https://app.fibraos.com/api/health

# ¿Resuelve DNS?
dig +short fibraos.com
dig +short app.fibraos.com
dig +short demo.fibraos.com @1.1.1.1

# ¿Cloudflare API responde?
curl -fsS -H "Authorization: Bearer $CLOUDFLARE_DNS_API_TOKEN" \
  https://api.cloudflare.com/client/v4/user/tokens/verify | jq
```

## Escenarios

### A. Cloudflare down

- Status page Cloudflare: https://www.cloudflarestatus.com/
- Sin acción posible más allá de esperar. Comunicar en status page propia.

### B. Expira wildcard `*.fibraos.com`

Caddy renueva al 66% de vida (día 60 de 90). Si vemos advertencias en logs:

```bash
docker compose -f docker-compose.prod.yml logs caddy | grep -i "expire\|renew\|acme"
```

Forzar renovación:

```bash
docker compose -f docker-compose.prod.yml exec caddy \
  caddy reload --config /etc/caddy/Caddyfile
```

Si falla, comprobar `CLOUDFLARE_DNS_API_TOKEN` (rotate runbook).

### C. Rate limit de Let's Encrypt

- Check `crt.sh`: si hay > 45 certs nuevos en 7 días, cualquier nuevo falla.
- Mitigación corta: `tls internal` en Caddyfile para el wildcard (cert
  autofirmado) **solo** si la alternativa es caída total. Navegadores
  mostrarán warning, no es aceptable más de 1-2 horas.
- Mejor: esperar a la ventana (7 días) o mover el dominio raíz por separado.

### D. DNS mal apuntado

Verificar que los A/AAAA en Cloudflare apuntan al server vigente:

```
@   A     <IP server>
www A     <IP server>
app A     <IP server>
*   A     <IP server>
```

Cambios en Cloudflare propagan en ~1 min con TTL 300.

### E. Caddy cae

```bash
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs caddy --tail 100
docker compose -f docker-compose.prod.yml up -d caddy
```

Si el container no arranca:
- Revisar Caddyfile con `caddy validate --config /etc/caddy/Caddyfile`.
- Volumen `caddydata` con certs podría estar corrupto; **no borrar** sin
  agendar renovación porque dispararía rate limit.

## Comunicación

1. Postear en status.fibraos.com.
2. Email a admins de tenants Pro+ con ETA (outbox `email.incident`).
3. Update cada 30 min hasta resolver.

## Post-mortem

Crear issue en `docs/postmortems/YYYY-MM-DD-dns.md` con timeline, causa raíz,
acción correctiva.
