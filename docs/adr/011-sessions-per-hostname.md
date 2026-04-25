# ADR-011: Sesiones independientes por hostname

- Status: accepted
- Date: 2026-04-24
- Sprint: 1

## Contexto

Un usuario con cuenta en FibraOS puede acceder a varias organizaciones
cada una en su propio hostname:
- `tmdigital.fibraos.com` (subdominio SaaS)
- `red.tmdigital.es` (dominio custom del mismo cliente)
- `otroclient.fibraos.com` (otro cliente)

Opciones de modelo de sesión:

1. **SSO global** con cookie cross-domain (requiere OAuth o SAML-like).
2. **Sesión por hostname**: cada host tiene su propia cookie.

## Decisión

**Sesión por hostname**. Cada host (`{slug}.fibraos.com`, `red.tmdigital.es`,
`app.fibraos.com`, `admin.fibraos.com`) emite cookies con `Domain=<host>`,
`SameSite=Lax`, `Secure`, `HttpOnly`. No hay SSO cross-host.

Flujo de acceso:

1. Usuario va a `red.tmdigital.es/boxes` sin sesión.
2. Middleware detecta falta de cookie, redirige a
   `https://app.fibraos.com/login?next=https://red.tmdigital.es/boxes`.
3. Login global en `app.fibraos.com` emite cookie del host `app.*`.
4. Tras login, redirect a un endpoint one-time-token en el host destino
   (`red.tmdigital.es/auth/exchange?token=...`) que intercambia el token
   por una cookie propia del host.
5. El usuario navega ya autenticado en el hostname custom.

## Consecuencias

- **Pros**:
  - Aislamiento real: una cookie robada en un tenant no da acceso a otros.
  - Simplicidad: ningún host necesita confiar en otro a nivel cookie.
  - Cumple buenas prácticas de browser (cookies cross-origin son cada vez
    más restringidas).

- **Cons**:
  - UX: usuario con múltiples orgs hace login una vez pero paga un redirect
    extra al cambiar de host. Aceptable.
  - Implementación del token one-time en Sprint 8 (middleware + exchange).
  - Impersonación de super-admin vive solo en `admin.fibraos.com` + target
    tenant; no propaga a otros.

## Alternativas

| Alternativa | Por qué descartada |
|---|---|
| Cookie con `Domain=.fibraos.com` | Solo cubre subdominios; no funciona con dominios custom externos. |
| OAuth 2 full | Overkill para MVP; sube barrera de entrada del cliente. |
| localStorage con JWT | XSS leak potencial, sin `HttpOnly`; contradice principios de seguridad. |
| Single sign-on con iframe | Bloqueado por Safari ITP + SameSite. |
