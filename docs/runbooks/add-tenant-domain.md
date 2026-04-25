# Runbook · Añadir dominio custom a un tenant (soporte)

**Cuándo**: cliente reporta que su dominio no pasa de `pending_dns`.

## Información necesaria

- Email del admin del tenant.
- Hostname deseado (p.ej. `red.tmdigital.es`).
- Capturas del panel DNS del cliente.

## Diagnóstico

### 1. ¿Está registrado?

```sql
SELECT id, hostname, status, last_check_error, check_count, created_at
FROM tenant_domains
WHERE hostname = 'red.tmdigital.es';
```

Si no existe → el cliente nunca lo añadió. Pedir que use `/settings/domains`.

### 2. ¿Qué resuelve realmente?

Desde el servidor:

```bash
dig +short CNAME red.tmdigital.es
dig +short A red.tmdigital.es
dig +short TXT _fibraos-verify.red.tmdigital.es
```

**Esperado**: CNAME → `saas.fibraos.com` (o A → IP del servidor) + TXT con el token.

Si no coincide, mostrar al cliente los registros correctos desde el panel.

### 3. ¿Está el verifier corriendo?

```bash
docker compose -f docker-compose.prod.yml logs worker --tail 200 | grep domain_check
```

Buscar líneas `"domain_check"` con el `domainId` del cliente.

### 4. Forzar re-check manual

```bash
# Re-encolar un check inmediato
docker compose -f docker-compose.prod.yml exec app \
  node -e "
    (async () => {
      const { domainVerifierQueue } = require('./lib/queues');
      await domainVerifierQueue().add('manual', { domainId: '<DOMAIN_ID>' });
      process.exit(0);
    })()
  "
```

### 5. Si DNS es correcto pero sigue en `pending_dns`

Puede ser caché del resolver del worker. Reiniciar:

```bash
docker compose -f docker-compose.prod.yml restart worker
```

### 6. Si status = `verifying` pero el cert no se emite

Caddy está esperando la primera petición HTTPS al hostname. Pedir al
cliente que visite `https://red.tmdigital.es` desde el browser.

Desde nuestro lado podemos forzar:

```bash
curl -v https://red.tmdigital.es/api/health
```

Caddy llamará al ask endpoint; tras obtener 200 emite cert.
Verificar en logs de Caddy:

```bash
docker compose -f docker-compose.prod.yml logs caddy --tail 100 | grep red.tmdigital
```

### 7. Si LE rechaza (rate limit)

Mensaje típico: `"too many certificates already issued"` o `"5 per hour"`.

- Verificar en [CT log](https://crt.sh/?q=fibraos.com) que no hemos
  desbordado el límite de 50 certs/semana por dominio raíz.
- Si sí, esperar ventana o usar `DirectoryURL` staging de LE temporalmente
  para no consumir cuota durante debugging.

## Último recurso: emisión manual

```bash
docker compose -f docker-compose.prod.yml exec caddy \
  caddy admin --address caddy:2019 reload
```

Si persiste, contactar a soporte Caddy. En paralelo, considerar migrar ese
tenant concreto a Cloudflare for SaaS como fallback.
