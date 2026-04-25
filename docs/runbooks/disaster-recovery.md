# Runbook · Disaster Recovery

**Escenario**: el servidor de producción es irrecuperable (hardware, datacenter, ransomware).

**RTO objetivo**: 1 hora. **RPO**: 24 horas.

## Recursos offline (caja fuerte del equipo)

- Clave privada `age` para descifrar backups.
- Clave SSH privada del equipo con acceso al panel Hetzner.
- Credenciales Cloudflare con permiso DNS.
- Credenciales Stripe / Resend.

## Procedimiento (pasos cronometrados)

### 0. Activar incident (t+0)

- Crear incident en status.fibraos.com.
- Notificar a admins Pro+ por email manual.

### 1. Aprovisionar servidor nuevo (t+10 min)

Panel Hetzner Cloud → Create Server:

- **Tipo**: CPX31 (o idéntico al original).
- **Imagen**: Ubuntu 24.04.
- **SSH key**: la de deploy.
- **Nombre**: `fibraos-prod-v2`.
- **Zona**: Helsinki (o Falkenstein, misma del original para baja latencia).

Tras provisioning, anotar la IPv4 + IPv6.

### 2. Bootstrap (t+15 min)

```bash
ssh root@<nueva-ip> bash -s < infra/setup-server.sh
```

Añadir clave pública de GitHub Actions a `/home/deploy/.ssh/authorized_keys`.

### 3. Clonar repo + config (t+20 min)

```bash
ssh deploy@<nueva-ip>
cd /opt/fibraos
git clone https://github.com/<owner>/fibraos.git .
```

Subir `.env.production` desde la caja fuerte (NO commiteado):

```bash
# Desde tu máquina:
scp .env.production deploy@<nueva-ip>:/opt/fibraos/
ssh deploy@<nueva-ip> chmod 600 /opt/fibraos/.env.production
```

### 4. Actualizar DNS (t+25 min)

Cloudflare → DNS → editar `A` y `AAAA` de:
- `@` → nueva IP
- `www` → nueva IP
- `app` → nueva IP
- `admin` → nueva IP
- `*` → nueva IP (wildcard)

TTL 300. Propagación ~1 min.

### 5. Levantar stack (t+30 min)

```bash
cd /opt/fibraos
export GITHUB_OWNER=<owner>
export IMAGE_TAG=latest
echo "$GHCR_TOKEN" | docker login ghcr.io -u <bot-user> --password-stdin
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d postgres redis
sleep 15
```

### 6. Restaurar último backup (t+35 min)

Seguir `restore-postgres.md` pasos 1-4 apuntando al nuevo postgres.

### 7. Arrancar app + worker + caddy (t+45 min)

```bash
docker compose -f docker-compose.prod.yml up -d
```

Caddy tendrá que re-emitir certs: primera request a cada hostname disparará
ACME. Wildcard `*.fibraos.com` tarda ~30s (DNS-01). Dominios custom
on_demand_tls: esperar primera visita real.

### 8. Smoke test (t+55 min)

```bash
curl -fsS https://app.fibraos.com/api/health
curl -fsS https://demo.fibraos.com/
# Login con cuenta de test
```

Sentry debe empezar a recibir eventos con tag `environment=production`.

### 9. Comunicar resuelto (t+60 min)

- Actualizar incident en status.
- Email a admins.
- Abrir post-mortem en `docs/postmortems/`.

## Qué se pierde (RPO)

Cambios entre las 03:00 UTC del día anterior (último backup) y el momento
del desastre. Explicar al cliente en el post-mortem. Considerar aumentar
frecuencia de backups (cada 6h en lugar de 24h) tras el incidente.

## Mejoras post-incidente

- Réplica streaming Postgres a segundo servidor (§31.11).
- Backups cada 6h en lugar de 24h.
- Multi-region (Hetzner + otro proveedor) para HA real.
