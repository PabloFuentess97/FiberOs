# Runbook · Rotar secretos

**Cuándo**: trimestral (preventivo) o inmediato si sospechas fuga.

## Lista de secretos

| Secret | Dónde | Cómo regenerar |
|---|---|---|
| `AUTH_SECRET` | `.env.production` | `openssl rand -hex 32` |
| `INTERNAL_API_SECRET` | `.env.production` (app + Caddy) | `openssl rand -hex 32` |
| `POSTGRES_PASSWORD` | `.env.production` + usuario postgres | Ver "Rotar Postgres" abajo |
| `STRIPE_SECRET_KEY` | Stripe dashboard | Settings → Developers → API keys → Rotate |
| `STRIPE_WEBHOOK_SECRET` | Stripe dashboard | Webhook endpoint → Rotate |
| `RESEND_API_KEY` | Resend dashboard | API keys → Revoke + create |
| `CLOUDFLARE_DNS_API_TOKEN` | Cloudflare dashboard | My Profile → API Tokens |
| `S3_ACCESS_KEY`/`S3_SECRET_KEY` | R2 dashboard | R2 → Manage R2 API Tokens |
| SSH deploy key | GitHub secret | `ssh-keygen -t ed25519 -f fibraos-deploy-new` |
| `age` key | equipo | `age-keygen -o new-key.txt` (ver "Rotar age") |

## Procedimiento general

1. Generar nuevo secret localmente.
2. Actualizar en el proveedor (Stripe/Resend/CF) — obtener nuevo valor.
3. SSH al servidor:
   ```bash
   cd /opt/fibraos
   sudo cp .env.production .env.production.bak-$(date +%s)
   sudo $EDITOR .env.production
   # pegar nuevo valor; guardar
   sudo chmod 600 .env.production
   sudo chown deploy:deploy .env.production
   ```
4. Recargar servicios afectados:
   ```bash
   docker compose -f docker-compose.prod.yml up -d --force-recreate app worker caddy
   ```
5. Validar:
   ```bash
   curl -fsS https://app.fibraos.com/api/health
   # Probar flujo específico del secret rotado
   ```
6. Borrar el valor antiguo en el proveedor (Stripe/Resend/CF) después de 24h de margen.

## Rotar Postgres

La contraseña de `postgres` está en el volumen persistente. Cambiar:

```bash
docker compose -f docker-compose.prod.yml exec postgres \
  psql -U $POSTGRES_USER -c "ALTER USER $POSTGRES_USER WITH PASSWORD 'NEW_STRONG_PW';"

# Actualizar .env.production (DATABASE_URL + POSTGRES_PASSWORD + PgBouncer DATABASE_URL)
# Reiniciar
docker compose -f docker-compose.prod.yml up -d --force-recreate app worker pgbouncer
```

Si PgBouncer da "auth failed" después, comprobar que reloj del host está sincronizado.

## Rotar clave age

La clave `age` cifra los backups. No se puede descifrar un backup antiguo
con una clave nueva; por eso:

1. Generar `age-keygen > new-key.txt`.
2. Subir la pública a `BACKUP_AGE_RECIPIENT` en `.env.production`.
3. Esperar 30 días (retención de backups) antes de borrar la clave antigua.
4. **Guardar** la clave antigua offline (caja fuerte) durante un año por si
   hiciera falta restaurar un backup anterior.

## Auditoría

Después de rotar: comprobar `docs/runbooks/audit-ssh-keys.md` y los últimos
`audit_log` de super-admin para detectar accesos no reconocidos.
