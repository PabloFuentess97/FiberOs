# ADR-001: Stack técnico elegido

- Status: accepted
- Date: 2026-04-23
- Sprint: 0

## Contexto

FibraOS es un SaaS multi-tenant (B2B) para operadores FTTH. Requisitos clave:
aislamiento fuerte por tenant, mapa geográfico, diagrama interactivo, PWA offline,
dominios personalizados por cliente y despliegue self-hosted en Hetzner. El cliente
piloto (TMDigital) necesita trabajar offline en campo y migrar desde Excel.

## Decisión

Se adopta el stack cerrado del blueprint (§4):

- **Frontend / framework:** Next.js 15 (App Router, RSC + Server Actions). TypeScript `strict`.
- **Estilos / UI:** Tailwind CSS v4 + shadcn/ui + lucide-react.
- **ORM / BD:** Drizzle ORM sobre Postgres 16 + PostGIS 3.4 (container `postgis/postgis:16-3.4`).
- **Pooler:** PgBouncer en modo `session` para permitir `SET LOCAL` en transacciones.
- **Auth:** Better Auth con adapter Drizzle (email/password + magic link + plan 2FA).
- **Mapa:** MapLibre GL + terra-draw + MapTiler tiles.
- **Diagrama:** React Flow (`@xyflow/react`).
- **PWA:** Serwist (`@serwist/next`) + Dexie (IndexedDB).
- **Colas:** BullMQ sobre Redis (mismo contenedor que cache de tenant).
- **Storage:** Cloudflare R2 (S3-compatible) por defecto; MinIO en dev.
- **Email:** Resend + react-email; Mailpit en dev.
- **Pagos:** Stripe Subscriptions + Customer Portal.
- **Observabilidad:** Sentry (diferido a Sprint 8) + pino (logs JSON).
- **Lint/format:** Biome. **Tests:** Vitest + Playwright.
- **Gestor paquetes:** pnpm 9. **CI:** GitHub Actions.
- **Deploy:** Hetzner Cloud + Docker Compose + Caddy 2 (`on_demand_tls`).

## Consecuencias

- **Pros:**
  - Una sola fuente de verdad de tipos (schema Drizzle → tipos inferidos → Zod → Server Action → cliente).
  - RSC reducen JS enviado al cliente — crítico para PWA y móvil en 4G.
  - Self-hosted en Hetzner da coste predecible (~€25–35/mes MVP) sin vendor lock-in.
  - Better Auth permite `trustedOrigins` dinámico (clave para dominios custom).
  - Caddy `on_demand_tls` elimina dependencia de Cloudflare for SaaS.

- **Cons / trade-offs:**
  - Responsabilidad operativa propia (backups, patches, monitor) vs managed PaaS.
  - Tailwind v4 está en beta; asumimos breaking changes menores hasta GA.
  - React 19 + Next 15 son recientes; algunos paquetes de ecosistema pueden ir detrás.
  - `noUncheckedIndexedAccess` aumenta verbosidad pero elimina clases enteras de bugs.

## Alternativas consideradas

| Alternativa | Por qué descartada |
|---|---|
| Remix + Prisma | Drizzle tiene mejor DX con Postgres avanzado (RLS, CTE, PostGIS). App Router cubre el caso sin salir del ecosistema. |
| Supabase como backend | Lock-in + coste impredecible + reglas de seguridad en PostgREST menos expresivas que Server Actions + RLS. |
| Vercel hosting | Modelo self-hosted es requisito del cliente para control y coste. |
| Prisma | Generator + migrations menos ergonómicos que `drizzle-kit` para nuestro schema con enums + triggers + PostGIS. |
| Auth.js (NextAuth) | `trustedOrigins` dinámico y multi-tenant de Better Auth ajusta mejor; decisión cerrada en blueprint §4. |
| MapBox | Coste por usuario activo; MapTiler free tier (100k tiles/mes) cubre MVP. |
| AWS RDS + EKS | Overhead operativo y coste desproporcionados para un MVP de 10–20 tenants. |
