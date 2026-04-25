# ADR-017: Tiles MapTiler en producción

- Status: accepted
- Date: 2026-04-23
- Sprint: 2

## Contexto

El mapa es el eje visual de FibraOS (§11.4). Necesitamos un proveedor de raster/vector tiles
fiable, compatible con MapLibre GL JS y con tier gratuito suficiente para el MVP. OpenStreetMap
Foundation prohíbe explícitamente el uso directo de sus tile servers en productos SaaS comerciales.

## Decisión

Usar **MapTiler** con el plan Free en dev y prod inicial:

- Estilo por defecto: `streets-v2`.
- 100k tile requests/mes gratis (suficiente para MVP con 10–20 tenants).
- API key vía variable de entorno `MAPTILER_API_KEY`.
- Fallback a `https://demotiles.maplibre.org/style.json` en dev cuando la key no está configurada (con aviso UI).
- Upgrade path a plan Essentials (USD 19/mes, 500k req) sin cambios de código.

## Consecuencias

- **Pros:**
  - Compatible directo con MapLibre GL JS.
  - Estilos de calidad sin configurar servidor de tiles propio.
  - Key única en env, sin cambios de código para cambiar de plan.

- **Cons / trade-offs:**
  - Dependencia externa: si MapTiler cae, el mapa no carga (el resto de la app funciona). Mitigación: cachear tiles frecuentes en el Service Worker (Sprint 5 PWA).
  - Rate limits: 100k/mes es generoso pero no ilimitado. En crecimiento (50+ tenants) hay que migrar al plan Essentials o self-host con tileserver-gl + Planet data.
  - En self-host completo (cliente que lo exija), fallback a MapLibre + tileserver propio, cambiando solo `NEXT_PUBLIC_MAP_STYLE_URL`.

## Alternativas consideradas

| Alternativa | Por qué descartada |
|---|---|
| OSM raster tiles directo | Prohibido explícitamente para uso comercial tier gratuito. |
| Mapbox | Free tier más generoso pero condiciones propietarias del SDK y tiles. |
| Stadia Maps | Plan free 20k/día pero sin cobertura equivalente. |
| Tileserver-gl propio | Requiere varios GB de MBTiles y mantenimiento; innecesario para MVP. |
| ESRI World Street Map | Licencia comercial ambigua para uso SaaS. |
