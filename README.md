# FibraOS

> SaaS multi-tenant para gestión de red FTTH. Construido según el blueprint en `../output/fibraos-blueprint.md`.

## Quickstart (dev)

```bash
# 1. Copia variables de entorno
cp .env.example .env.local

# 2. Añade a /etc/hosts (Linux/macOS) o C:\Windows\System32\drivers\etc\hosts (Windows):
#    127.0.0.1  fibraos.local www.fibraos.local app.fibraos.local admin.fibraos.local demo.fibraos.local

# 3. Levanta infraestructura local
docker compose up -d

# 4. Instala dependencias
pnpm install

# 5. Aplica schema
pnpm db:push

# 6. Seed
pnpm seed

# 7. Arranca
pnpm dev
```

Abre:
- **Marketing:** http://fibraos.local:3000/
- **Auth:** http://app.fibraos.local:3000/login (`admin@demo.test` / `Demo1234!`)
- **Tenant demo:** http://demo.fibraos.local:3000/
- **Super-admin:** http://admin.fibraos.local:3000/
- **Mailpit:** http://localhost:8025 (emails en dev)
- **MinIO console:** http://localhost:9001 (`minioadmin` / `minioadmin`)

## Estructura

Ver `CLAUDE.md` para reglas de arquitectura y blueprint completo en `../output/fibraos-blueprint.md`.

## Estado

Sprint 0 completo (§23 del blueprint). Ver `docs/sprints/0-resumen.md`.

## Scripts útiles

| Script | Uso |
|---|---|
| `pnpm dev` | Dev server |
| `pnpm lint` | Biome |
| `pnpm typecheck` | TypeScript |
| `pnpm test` | Vitest unit |
| `pnpm test:e2e` | Playwright |
| `pnpm db:push` | Aplicar schema (dev) |
| `pnpm db:generate` | Generar migración |
| `pnpm db:migrate` | Aplicar migraciones (CI/prod) |
| `pnpm db:studio` | Drizzle Studio UI |
| `pnpm seed` | Sembrar datos demo |
| `pnpm reset-db` | Drop + recreate schema |

## Licencia

Propietaria.
