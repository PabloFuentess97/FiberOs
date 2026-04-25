# ADR-016: Dibujo en mapa con `terra-draw`

- Status: accepted
- Date: 2026-04-23
- Sprint: 2

## Contexto

El blueprint (§11.4, §11.6) requiere dibujar polilíneas sobre el mapa para registrar el
trazado real de cables. MapLibre no incluye herramientas de dibujo nativas; Mapbox
Draw es propietaria y `@mapbox/mapbox-gl-draw` tiene licencia restrictiva y está en
mantenimiento mínimo. Evaluamos reemplazos.

## Decisión

Usar **`terra-draw`** con su adapter para MapLibre (`TerraDrawMapLibreGLAdapter`).
Motivos:

- MIT, mantenida activamente (última versión 1.0.0).
- Agnóstica de renderer: hoy MapLibre, mañana OpenLayers o Leaflet sin reescritura.
- Modos integrados: `LineStringMode`, `PolygonMode`, `PointMode`, `SelectMode`, `FreehandMode`.
- Snapshot en GeoJSON listo para enviar al servidor vía Server Action.
- TypeScript first-class.

## Consecuencias

- **Pros:**
  - Cable drawing se implementa en un componente ~100 LOC (`components/map/CableDrawClient.tsx`).
  - Reutilizable para futuras polilíneas (conductos, zonas de servicio).

- **Cons / trade-offs:**
  - API aún evolucionando — el bump 0.x → 1.x cambió import paths. Mitigar fijando versión en `package.json`.
  - No incluye edición de vértices individuales tan fina como Mapbox Draw; suficiente para MVP.
  - Bundle adicional ~30kB gzip solo cuando se carga la ruta de dibujo (dynamic import).

## Alternativas consideradas

| Alternativa | Por qué descartada |
|---|---|
| `@mapbox/mapbox-gl-draw` con MapLibre shim | Licencia MapBox ToS ambigua con MapLibre; mantenimiento estancado. |
| Implementación custom | Reinventa la rueda; coste alto para features que terra-draw ya ofrece. |
| OpenLayers en lugar de MapLibre | Cambio más profundo que solo dibujo; contradice §4 del blueprint. |
