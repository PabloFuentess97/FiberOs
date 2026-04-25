#!/bin/sh
# FibraOS · backup nocturno (§19.5 del blueprint).
# Corre desde el sidecar `backup` en docker-compose.prod.yml a las 03:00 UTC.
# Env requerido: POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB,
#                BACKUP_AGE_RECIPIENT, BACKUP_RCLONE_REMOTE.
set -eu

STAMP=$(date -u +%Y-%m-%dT%H-%M-%SZ)
TMP=/tmp
FILE=$TMP/fibraos-$STAMP.dump

echo "[backup] starting $STAMP"

PGPASSWORD=$POSTGRES_PASSWORD pg_dump \
  -h postgres -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  --format=custom --compress=9 \
  --no-owner --no-privileges \
  -f "$FILE"

# Cifrado con age (clave pública del equipo)
age -r "$BACKUP_AGE_RECIPIENT" -o "$FILE.age" "$FILE"
rm -f "$FILE"

# Subir a R2 (o Hetzner Object Storage)
rclone copy --quiet "$FILE.age" "$BACKUP_RCLONE_REMOTE/postgres/"
rm -f "$FILE.age"

# Retención
#   - Diarios: 30 días
#   - Mensuales (día 1): 12 meses
DAY=$(date -u +%d)
if [ "$DAY" = "01" ]; then
  # No tocar los de día 1
  rclone delete --min-age 30d "$BACKUP_RCLONE_REMOTE/postgres/" \
    --exclude "*-01T*-*-*Z.dump.age" 2>&1 | tail -n 5
  # Limpiar mensuales > 12 meses
  rclone delete --min-age 365d "$BACKUP_RCLONE_REMOTE/postgres/" \
    --include "*-01T*-*-*Z.dump.age" 2>&1 | tail -n 5
else
  rclone delete --min-age 30d "$BACKUP_RCLONE_REMOTE/postgres/" 2>&1 | tail -n 5
fi

echo "[backup] done $STAMP"
