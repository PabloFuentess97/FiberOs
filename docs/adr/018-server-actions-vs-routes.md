# ADR-018: Server Actions vs Route Handlers (cuándo cada uno)

- Status: accepted
- Date: 2026-04-24
- Sprint: 0

## Contexto

Next.js 15 ofrece dos formas de ejecutar código de servidor invocado desde
el cliente: **Server Actions** (`"use server"` + `<form action={fn}>`) y
**Route Handlers** (`/api/**/route.ts`). Ambos son válidos pero la UX y
las garantías difieren.

## Decisión

### Usamos Server Actions para:

- **Mutaciones del dashboard** con UI asociada (CRUD de cajas, cables,
  fusiones, clientes, branding, dominios, billing).
- Justificación:
  - Integración natural con `useActionState` y `<form action>`.
  - `revalidatePath` / `revalidateTag` sin código extra.
  - Sin superficie HTTP pública que mantener — el contrato vive en el
    código, no en un esquema OpenAPI.
  - Progressive enhancement: funcionan sin JS.

### Usamos Route Handlers REST para:

- **Webhooks entrantes**: Stripe, Resend, Cloudflare (firma HMAC, acceso sin sesión tenant).
- **PWA offline (`/api/field/*`)**: el Service Worker intercepta rutas
  conocidas; Server Actions tienen URLs opacas `/_next/action/{hash}`
  inestables entre builds.
- **Descargas binarias** (`/api/export/xlsx`, `/api/labels/[id]`, `/api/qr/[shortId]`):
  Server Actions no son ideales para streaming binarios grandes.
- **Internal / admin** (`/api/internal/domain-authorize`, `/api/search`):
  cacheables por scope (cmd+K), invocables por infra (Caddy).
- **Jobs polling** (`/api/jobs/[id]`): GET explícito + cache semánticamente correcto.

### Reglas cross-cortes (aplican a ambos)

1. Validación con Zod en el servidor.
2. `withTenantTx` + `SET LOCAL` para RLS.
3. `requireRole` antes de mutar.
4. Outbox para efectos externos.
5. Errores canónicos `{ ok: false, error: { code, message } }`.

## Consecuencias

- **Pros**:
  - Minimizamos superficie API pública: solo lo que realmente lo necesita.
  - UX consistent: forms nativos + progressive enhancement.
  - Lint rule detecta `fetch` a `/api/...` dentro de componentes RSC (code
    smell: probablemente debería ser import directo o Server Action).

- **Cons**:
  - Testing de Server Actions requiere renderizar el form (o llamar la
    función directo); tests unit llaman la action como función.
  - Imposible migrar un Server Action a otra plataforma sin cambio de
    firma. OK: no planificamos migrar.

## Alternativas

| Alternativa | Por qué descartada |
|---|---|
| Todo Route Handlers | Pierde DX de Server Actions y `revalidatePath`. |
| Todo Server Actions | PWA rompe: el SW no intercepta `/_next/action/{hash}`. |
| tRPC | Capa de abstracción extra; Server Actions ya dan type-safety. |
| GraphQL | Sobreingeniería total para el dominio MVP. |
