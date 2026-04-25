# Instalación en Hetzner Cloud + Docker

Guía paso a paso para desplegar FibraOS en un VPS Hetzner desde cero.
Asume que ya tienes el código en GitHub y un dominio que vas a apuntar al servidor.

**Tiempo estimado:** 60-90 minutos la primera vez.
**Coste estimado:** 14-20 €/mes (CPX31 + dominio).

---

## 0. Lo que necesitas ANTES de empezar

| Recurso | Cómo obtenerlo |
|---|---|
| Cuenta Hetzner Cloud | https://accounts.hetzner.com/signUp |
| Dominio (p.ej. `tu-fibra.com`) | Porkbun, Namecheap, Cloudflare Registrar (~12 €/año) |
| Cuenta Cloudflare (DNS gratis) | https://dash.cloudflare.com/sign-up |
| Cuenta MapTiler (free tier) | https://cloud.maptiler.com — API key |
| Clave SSH local | `ssh-keygen -t ed25519 -f ~/.ssh/fibraos-deploy -C "fibraos-deploy"` |

**Opcional (puedes añadirlos después):**
- Cuenta Resend (emails reales) — https://resend.com
- Cuenta Stripe (cobros) — https://dashboard.stripe.com
- Cuenta Sentry (errores) — https://sentry.io
- Cuenta Cloudflare R2 (storage S3) — alternativa: usar MinIO local

---

## 1. Configurar DNS en Cloudflare

1. Añade tu dominio a Cloudflare (Sites → Add a site).
2. Cambia los nameservers en tu registrador a los de Cloudflare.
3. **No actives proxy naranja** todavía (déjalo en gris/DNS only). Caddy gestiona TLS directamente.

Los registros DNS los crearás tras provisionar el servidor (paso 3).

---

## 2. Provisionar el VPS en Hetzner

1. Hetzner Cloud Console → **Add Server**.
2. **Location**: Helsinki (HEL1) o Falkenstein (FSN1) — los más baratos.
3. **Image**: Ubuntu 24.04.
4. **Type**: **CPX31** (4 vCPU AMD, 8 GB RAM, 160 GB NVMe, ~14 €/mes).
   - Si solo vas a probar: CPX21 (~7 €/mes). Suficiente para 5-10 tenants.
5. **SSH key**: pega tu clave pública (`cat ~/.ssh/fibraos-deploy.pub`).
6. **Name**: `fibraos-prod`.
7. **Networking**: IPv4 + IPv6.

Tras el create, **anota la IPv4 y la IPv6** que asigna Hetzner.

---

## 3. Apuntar DNS al servidor

En Cloudflare → DNS → Records, crea (sustituye `<IPv4>` y `<IPv6>` por los del paso 2):

```
@      A     <IPv4>          (tu-fibra.com)
@      AAAA  <IPv6>
www    A     <IPv4>
app    A     <IPv4>
admin  A     <IPv4>
*      A     <IPv4>          ← wildcard para *.tu-fibra.com (subdominios tenant)
```

TTL: 5 minutos (300s) durante la instalación. Lo subes a 1h después.

Espera 1-2 minutos y verifica desde tu máquina:
```bash
dig +short app.tu-fibra.com  # debe devolver la IPv4
```

---

## 4. Bootstrap del servidor

Desde tu máquina:

```bash
ssh -i ~/.ssh/fibraos-deploy root@<IPv4>
```

Acepta el host, y dentro del servidor:

```bash
# Descargar el repo (no clones todo aún, solo el script)
curl -fsSL https://raw.githubusercontent.com/PabloFuentess97/FiberOs/main/infra/setup-server.sh -o /tmp/setup.sh
chmod +x /tmp/setup.sh
bash /tmp/setup.sh
```

Esto instala Docker, crea usuario `deploy`, configura firewall, fail2ban,
unattended-upgrades, y prepara los volúmenes en `/var/lib/fibraos/`.

**Después del setup, no podrás volver a entrar como root por SSH** (lo bloquea).
Usa `deploy@<IPv4>`.

---

## 5. Añadir tu clave SSH al usuario deploy

Desde tu máquina:

```bash
ssh-copy-id -i ~/.ssh/fibraos-deploy.pub deploy@<IPv4>
# O manualmente:
cat ~/.ssh/fibraos-deploy.pub | ssh root@<IPv4> 'cat >> /home/deploy/.ssh/authorized_keys'
```

Verifica:
```bash
ssh -i ~/.ssh/fibraos-deploy deploy@<IPv4> "whoami && docker ps"
```

---

## 6. Clonar el repo en el servidor

```bash
ssh deploy@<IPv4>
cd /opt/fibraos
git clone https://github.com/PabloFuentess97/FiberOs.git .
```

---

## 7. Generar secretos

Aún en el servidor:

```bash
# AUTH_SECRET (Better Auth)
echo "AUTH_SECRET=$(openssl rand -hex 32)"

# INTERNAL_API_SECRET (Caddy ↔ app)
echo "INTERNAL_API_SECRET=$(openssl rand -hex 32)"

# 2FA encryption key
echo "TWO_FACTOR_ENCRYPTION_KEY=$(openssl rand -hex 32)"

# Postgres password
echo "POSTGRES_PASSWORD=$(openssl rand -hex 24)"

# Generar par de claves age para cifrar backups
sudo apt-get install -y age
age-keygen -o /home/deploy/.age/key.txt
chmod 600 /home/deploy/.age/key.txt
mkdir -p /home/deploy/.age
# La clave PÚBLICA (age1...) la usas en BACKUP_AGE_RECIPIENT
cat /home/deploy/.age/key.txt | grep "public key"
```

**Anota los outputs**, los pegarás en `.env.production`.

**IMPORTANTE — Clave age**:
La clave PRIVADA (`/home/deploy/.age/key.txt`) cifra los backups. Si la pierdes,
**no podrás restaurar**. Cópiala en tu gestor de contraseñas o caja fuerte:

```bash
cat /home/deploy/.age/key.txt   # cópialo a un sitio seguro AHORA
```

---

## 8. Crear `.env.production`

```bash
sudo -u deploy nano /opt/fibraos/.env.production
```

Pega esto (sustituyendo los `<...>` por valores reales):

```bash
# ============ App ============
NODE_ENV=production
NEXT_PUBLIC_APP_URL=https://app.tu-fibra.com
NEXT_PUBLIC_ROOT_DOMAIN=tu-fibra.com
NEXT_PUBLIC_MAP_STYLE_URL=https://api.maptiler.com/maps/streets-v2/style.json?key=<TU_MAPTILER_KEY>
MAPTILER_API_KEY=<TU_MAPTILER_KEY>

# ============ Database ============
POSTGRES_USER=fibraos
POSTGRES_PASSWORD=<paste_del_paso_7>
POSTGRES_DB=fibraos
DATABASE_URL=postgres://fibraos:<password>@pgbouncer:6432/fibraos?sslmode=disable
DIRECT_URL=postgres://fibraos:<password>@postgres:5432/fibraos?sslmode=disable

# ============ Redis ============
REDIS_URL=redis://redis:6379

# ============ Auth ============
AUTH_SECRET=<paste_del_paso_7>
AUTH_EMAIL_FROM=no-reply@tu-fibra.com

# ============ 2FA ============
TWO_FACTOR_ENCRYPTION_KEY=<paste_del_paso_7>

# ============ Internal ============
INTERNAL_API_SECRET=<paste_del_paso_7>

# ============ Caddy / Domains ============
PUBLIC_HOSTNAME=app.tu-fibra.com
PUBLIC_IPV4=<la_IP_del_servidor>
PUBLIC_IPV6=<la_IPv6_del_servidor>
DOMAIN_PROVIDER=caddy_on_demand

# Cloudflare DNS-01 para wildcard *.tu-fibra.com
# Crea token en Cloudflare → My Profile → API Tokens → Create Token
# Plantilla "Edit zone DNS" con permisos sobre tu zona.
CLOUDFLARE_DNS_API_TOKEN=<token_cloudflare>

# ============ Storage ============
# Opción A: Cloudflare R2 (recomendado, sin egress fees)
S3_ENDPOINT=https://<account_id>.r2.cloudflarestorage.com
S3_ACCESS_KEY=<r2_access_key>
S3_SECRET_KEY=<r2_secret_key>
S3_BUCKET=fibraos-files-prod
S3_REGION=auto
S3_PUBLIC_URL=https://files.tu-fibra.com

# ============ Email (Resend) — opcional al inicio ============
RESEND_API_KEY=

# ============ Stripe — opcional al inicio ============
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRICE_STARTER=
STRIPE_PRICE_PRO=
STRIPE_PRICE_BUSINESS=

# ============ Sentry — opcional al inicio ============
SENTRY_DSN=
NEXT_PUBLIC_SENTRY_DSN=

# ============ Super admin ============
SUPER_ADMIN_EMAILS=tu-email@dominio.com

# ============ Worker ============
WORKER_MODE=false   # se sobrescribe en el contenedor worker

# ============ Backup ============
BACKUP_RCLONE_REMOTE=r2:fibraos-backups
BACKUP_AGE_RECIPIENT=<la_clave_PÚBLICA_age_del_paso_7>

# ============ GitHub (para docker-compose pull desde GHCR) ============
GITHUB_OWNER=PabloFuentess97
IMAGE_TAG=latest
```

Permisos restrictivos:
```bash
sudo chmod 600 /opt/fibraos/.env.production
sudo chown deploy:deploy /opt/fibraos/.env.production
```

---

## 9. Configurar `rclone` para backups

Solo si vas a usar R2 desde el día 1:

```bash
sudo -u deploy rclone config
# n) New remote → name: r2
# Storage: s3
# Provider: Cloudflare
# pegar credenciales R2
```

Si saltas R2 ahora, los backups se quedarán en disco local hasta que lo configures.

---

## 10. Imagen Caddy custom (con plugin Cloudflare)

Caddy necesita el plugin `caddy-dns/cloudflare` para emitir el wildcard.
La imagen se construye automáticamente al hacer `docker compose up`:

```bash
cd /opt/fibraos
docker compose -f docker-compose.prod.yml build caddy
```

Tarda 1-2 minutos.

---

## 11. Primer arranque

```bash
cd /opt/fibraos

# Login a GHCR (necesitas un Personal Access Token de GitHub con scope `read:packages`)
echo "<tu_GHCR_TOKEN>" | docker login ghcr.io -u PabloFuentess97 --password-stdin

# Pull de la imagen app
docker compose -f docker-compose.prod.yml pull app worker

# Si no tienes imagen aún en GHCR, build local:
# docker compose -f docker-compose.prod.yml build app

# Levantar postgres + redis primero
docker compose -f docker-compose.prod.yml up -d postgres redis
sleep 15

# Aplicar schema
docker compose -f docker-compose.prod.yml run --rm app pnpm db:push --force
docker compose -f docker-compose.prod.yml run --rm app pnpm db:sql

# Seed inicial
docker compose -f docker-compose.prod.yml run --rm app pnpm seed

# Levantar todo
docker compose -f docker-compose.prod.yml up -d

# Ver logs
docker compose -f docker-compose.prod.yml logs -f --tail 50
```

---

## 12. Verificación

```bash
# Healthcheck local (dentro del servidor)
curl -fsS http://localhost:3000/api/health
# {"ok":true,"version":"...","now":...}

# Healthcheck público (desde tu máquina)
curl -fsS https://app.tu-fibra.com/api/health

# Caddy emitirá certs LE automáticamente al recibir tráfico HTTPS
docker compose -f docker-compose.prod.yml logs caddy | grep -i "obtain"
```

Abre en el navegador:
- `https://tu-fibra.com` → marketing
- `https://app.tu-fibra.com/login` → login global (admin@demo.test / Demo1234!)
- `https://demo.tu-fibra.com` → tenant demo (tras login)

---

## 13. Configurar GitHub Actions para deploys automáticos

En el repo en GitHub → **Settings → Secrets and variables → Actions → New repository secret**:

| Secret | Valor |
|---|---|
| `GHCR_TOKEN` | Personal Access Token con `read:packages, write:packages` |
| `SSH_KEY` | Contenido de `~/.ssh/fibraos-deploy` (clave **privada**) |
| `STAGING_SSH_HOST` | IP del staging (o la misma de prod si no tienes staging) |
| `PROD_SSH_HOST` | IP de tu servidor |

Tras esto, cualquier `git push origin main` ejecuta:
1. CI: lint + typecheck + tests + integration.
2. Build de imagen Docker → push a GHCR.
3. SSH al servidor → pull + migrate + rolling update.
4. Healthcheck → rollback automático si falla.

---

## 14. Backup test (importante — hacerlo el primer día)

Después de 24h con seed cargada:

```bash
ssh deploy@<IPv4>
cd /opt/fibraos

# Forzar un backup ahora (no esperar al cron de las 03:00)
docker compose -f docker-compose.prod.yml exec backup /backup.sh

# Verificar que se subió a R2
rclone ls r2:fibraos-backups/postgres/

# Test de restore (sigue docs/runbooks/restore-postgres.md)
```

Sin un backup verificado funcional, el primer fallo es catastrófico.

---

## Comandos útiles del día a día

```bash
# Ver estado
docker compose -f docker-compose.prod.yml ps

# Ver logs en vivo
docker compose -f docker-compose.prod.yml logs -f app

# Reiniciar app sin downtime (porque hay 2 réplicas)
docker compose -f docker-compose.prod.yml up -d --no-deps --force-recreate app

# Entrar a postgres
docker compose -f docker-compose.prod.yml exec postgres psql -U fibraos -d fibraos

# Entrar al contenedor app
docker compose -f docker-compose.prod.yml exec app sh

# Aplicar nueva migración tras pull
docker compose -f docker-compose.prod.yml run --rm app pnpm db:migrate

# Ver uso de disco de los volúmenes
sudo du -sh /var/lib/fibraos/*
```

---

## Troubleshooting rápido

**El sitio no responde HTTPS pero sí HTTP**:
- Caddy aún no ha emitido certs. Espera 30-60s tras la primera petición.
- `docker compose logs caddy | grep -i acme` para ver progreso.
- Verifica `CLOUDFLARE_DNS_API_TOKEN` con `dig`: el wildcard requiere DNS-01.

**Los subdominios `*.tu-fibra.com` no resuelven**:
- Falta el record DNS `*  A  <IP>` en Cloudflare.

**`docker login ghcr.io` falla**:
- El PAT necesita scope `read:packages`. Crear en https://github.com/settings/tokens.

**`pnpm db:push` da error de conexión**:
- Espera a que postgres esté `healthy`: `docker compose ps`.

**Healthcheck `/api/health` devuelve 503**:
- Postgres no responde. `docker compose logs postgres`.

**Tras un deploy la app no arranca**:
- Rollback manual: `IMAGE_TAG=previous docker compose up -d --no-deps app worker`.

Para incidentes mayores, ver runbooks en `docs/runbooks/`.

---

## Costes mensuales reales (estimación con tráfico bajo)

| Partida | Coste |
|---|---|
| Hetzner CPX31 | 14 € |
| Snapshots semanales | ~2 € |
| Cloudflare DNS | gratis |
| Cloudflare R2 (10 GB + 100k requests) | ~1 € |
| Dominio | ~1 €/mes (12 €/año) |
| MapTiler free tier (100k tiles) | gratis |
| Resend free tier (3k emails) | gratis |
| Stripe (pago por uso) | 1.4% + 0.25 €/tx |
| **Total** | **~18-20 €/mes** |
