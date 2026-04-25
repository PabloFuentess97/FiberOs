# ADR-020: Cambio de slug con aliases 90 días

- Status: accepted
- Date: 2026-04-24
- Sprint: 1

## Contexto

Una organización puede querer cambiar su slug (ejemplo: rebrand, fusión,
error tipográfico al crear la cuenta). El slug forma parte del hostname
(`{slug}.fibraos.com`), de URLs guardadas por el cliente, de QR impresos
en cajas físicas y posiblemente de integraciones externas.

Un cambio sin migración rompe:
- QR escaneados que redirigen a un host que ya no existe.
- Bookmarks de usuarios.
- Referencias en emails antiguos.
- Webhooks en plataformas del cliente.

## Decisión

Tabla `tenant_slug_aliases` con:

```sql
CREATE TABLE tenant_slug_aliases (
  slug TEXT PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,  -- 90 días por defecto
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Al cambiar slug de `demo` → `tmdigital`:
1. Insert en `tenant_slug_aliases(slug='demo', org_id=X, expires_at=now()+90d)`.
2. Update `organizations.slug = 'tmdigital'`.
3. El middleware de resolución por hostname (`resolveTenantByHost`):
   - Busca primero en `organizations.slug`.
   - Si no encuentra, busca en `tenant_slug_aliases` (no expirados).
   - Si encuentra alias activo → redirect 301 permanente al nuevo hostname.

Después de 90 días, un cron mensual borra aliases expirados.
El usuario recibe email 15 días antes de la expiración.

## Consecuencias

- **Pros**:
  - QR físicos siguen funcionando 3 meses: el equipo del tenant puede
    reimprimir sin prisa.
  - SEO conservado (redirect 301).
  - Un usuario técnico puede recuperar control de un slug liberado sin
    colisionar con un bookmark viejo.

- **Cons**:
  - 90 días es una ventana donde el slug antiguo queda "reservado" aunque
    nadie lo use (no reutilizable por otra org).
  - Si el cliente encadena varios cambios, la tabla crece; limpiar con el
    cron mensual mitiga.

## Alternativas

| Alternativa | Por qué descartada |
|---|---|
| Cambio sin aliases | Rompe QR físicos instalados: inaceptable. |
| Alias indefinido | Bloquea reutilización del slug para siempre. |
| Solo slug inmutable | UX horrible si el cliente se equivoca al alta. |
| Tabla `tenant_hostnames` con múltiples activos | Se solapa con `tenant_domains` (dominios custom); mejor separar. |
