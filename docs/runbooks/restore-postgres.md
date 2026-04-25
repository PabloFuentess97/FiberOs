# Runbook · Restaurar Postgres desde backup

**RTO objetivo**: 1h. **RPO**: 24h.
**Cuándo**: corrupción, delete accidental, disaster recovery.

## Precondiciones

- Acceso SSH al servidor target (deploy user).
- Clave privada `age` del equipo para descifrar dump.
- Credenciales `rclone` configuradas para R2 (`~/.config/rclone/rclone.conf`).
- Docker + docker compose plugin.

## Pasos

### 1. Identificar el dump a restaurar

```bash
rclone ls r2:fibraos-backups/postgres/ | sort
# elegir uno, p.ej. fibraos-2026-04-23T03-00-00Z.dump.age
```

### 2. Descargar y descifrar

```bash
cd /tmp
STAMP=2026-04-23T03-00-00Z
rclone copy r2:fibraos-backups/postgres/fibraos-$STAMP.dump.age ./
age -d -i ~/.age/key.txt -o fibraos-$STAMP.dump fibraos-$STAMP.dump.age
```

### 3. Restaurar en base temporal para verificar

```bash
# Levantar un postgres desechable en puerto 5433
docker run -d --name pg-restore-check \
  -e POSTGRES_PASSWORD=temp \
  -p 5433:5432 \
  postgis/postgis:16-3.4

sleep 10
createdb -h localhost -p 5433 -U postgres fibraos_restored
pg_restore -h localhost -p 5433 -U postgres -d fibraos_restored \
  --no-owner --no-privileges -j 4 /tmp/fibraos-$STAMP.dump

# Validar rápido
psql -h localhost -p 5433 -U postgres -d fibraos_restored -c \
  "SELECT count(*) FROM organizations;"
```

### 4. Restaurar sobre producción (solo si el dump es correcto)

**ALERTA**: esto pisa los datos actuales. Detener la app primero.

```bash
cd /opt/fibraos
docker compose -f docker-compose.prod.yml stop app worker

# Backup defensivo del estado actual (por si acaso)
docker compose -f docker-compose.prod.yml exec -T postgres \
  pg_dump -U $POSTGRES_USER $POSTGRES_DB --format=custom \
  > /var/lib/fibraos/pre-restore-$(date +%s).dump

# Drop + recreate
docker compose -f docker-compose.prod.yml exec -T postgres \
  psql -U $POSTGRES_USER -c "DROP DATABASE IF EXISTS $POSTGRES_DB WITH (FORCE);"
docker compose -f docker-compose.prod.yml exec -T postgres \
  psql -U $POSTGRES_USER -c "CREATE DATABASE $POSTGRES_DB;"

# Restaurar
docker compose -f docker-compose.prod.yml exec -T postgres \
  pg_restore -U $POSTGRES_USER -d $POSTGRES_DB --no-owner --no-privileges -j 4 \
  < /tmp/fibraos-$STAMP.dump

# Re-aplicar SQL custom (índices GIST, triggers, etc) — pg_dump los incluye,
# pero conviene verificar:
docker compose -f docker-compose.prod.yml exec -T postgres \
  psql -U $POSTGRES_USER -d $POSTGRES_DB -c "\di boxes_geom_idx"

docker compose -f docker-compose.prod.yml up -d app worker
```

### 5. Smoke test post-restore

```bash
curl -fsS https://app.fibraos.com/api/health
# Login + ver cajas + trazado de impacto
```

### 6. Cleanup

```bash
docker rm -f pg-restore-check
rm -f /tmp/fibraos-$STAMP.dump*
```

## Test trimestral

Agendar en el calendario del equipo: ejecutar pasos 1-3 contra staging
usando el dump de producción del día anterior. Medir tiempo total.
Objetivo: restore verificable en < 30 min.
