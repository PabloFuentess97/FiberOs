# Sprint 2 — Resumen

- Fecha: 2026-04-23
- Objetivo (§23): gestionar cajas y cables en UI con mapa.

## Entregado

### Modelo de datos
- `lib/db/schema/network.ts` con Drizzle: `boxes`, `trays`, `cables`, `fibers` + enums completos (`box_type`, `box_status`, `cable_type`, `fiber_standard`, `fiber_color`, `fiber_status`).
- Custom types `geographyPoint` y `geographyLineString` para PostGIS.
- Columna `version` en `boxes` y `cables` (para LWW PWA Sprint 5).

### Migración SQL `0002_inventory.sql`
- Índices GIST en `boxes.location` y `cables.path`.
- `fn_generate_short_id()` y trigger `fn_boxes_set_short_id` — 8 chars sin I/O/0/1 para legibilidad QR.
- `fn_bump_version()` incrementa `version` en UPDATE si el cliente no la cambió explícitamente (preparado para conflict resolution PWA).
- Audit triggers aplicados a `boxes`, `trays`, `cables`, `fibers`.
- RLS + políticas `tenant_isolation_*` en las 4 tablas nuevas.

### Algoritmos clave
- `lib/geo/colors.ts`: `colorForFiber(n)` implementa TIA-598-C con ciclo cada 12 fibras + hex para UI.
- `lib/geo/postgis.ts`: helpers `pointSQL`, `lineStringSQL` con validación de rangos, `*FromGeoJSON` para hidratar.
- `lib/geo/markers.ts`: metadata por `box_type` (color, icono, label, orden) y grosores por `cable_type`.

### Backend
- Queries tipadas `lib/db/queries/boxes.ts` (listado filtrado + pagination cursor + mapa) y `cables.ts` (listado con joins de origen/destino + mapa GeoJSON).
- `lib/tenancy/guards.ts`: `requireTenantContext` lee header `x-tenant-id` inyectado por middleware y valida membership.
- Server Actions:
  - `boxes/actions.ts`: `createBoxAction`, `updateBoxAction`, `deleteBoxAction` con Zod + `withTenantTx` + `revalidatePath`.
  - `cables/actions.ts`: `createCableAction` con autogeneración en bulk de N fibras (chunks de 500) dentro de la misma transacción. `simulateCableCut` preparado para Sprint 4.

### UI dashboard
- Primitivos shadcn: `Button`, `Input`, `Label`, `Card*`, `Select`, `Table*`, `Badge`.
- `DashboardSidebar` con navegación activa + iconos Lucide.
- `TopBar` con menu de logout (llama `signOut` de Better Auth).
- Layout `(dashboard)` envuelve todas las rutas tenant excepto `/onboarding`.
- Dashboard home: 4 KPIs (cajas, cables, fibras, clientes) con `db.$count`.
- `/boxes` listado filtrable, `/boxes/new` (acepta `?lat=&lng=` del mapa), `/boxes/[id]` con tab General y edit query param.
- `/cables` listado con origen/destino, `/cables/new` form recto, `/cables/draw` MapLibre + terra-draw, `/cables/[id]` con tabla de fibras coloreadas según TIA-598-C.

### Mapa
- `components/map/MapClient.tsx` con MapLibre dinámico (import en useEffect para no romper SSR):
  - Layers `cables-line` (colores y grosores por `type`).
  - `boxes` con clustering (`clusterRadius=40`, `clusterMaxZoom=12`).
  - Cluster count symbol y hover-to-pointer.
  - **Pin-mode:** toggle con botón, próximo click navega a `/boxes/new?lat=...&lng=...`.
  - Fallback a `demotiles.maplibre.org` con aviso UI si `MAPTILER_API_KEY` falta.
- `components/map/CableDrawClient.tsx` con terra-draw (`TerraDrawLineStringMode`), form lateral con datos del cable; submit llama `createCableAction` con el GeoJSON capturado.

### Seed realista
- `scripts/seed.ts` extendido con topología de Granada: 1 OLT en Recogidas, 4 troncales (Centro/Albaicín/Realejo/Zaidín), 4 subtroncales, 7 CTOs, 15 cables (main_trunk → trunk → subtrunk → drop) con fibras autogeneradas.
- 4 usuarios, uno por rol, todos con password `Demo1234!`.

### Tests
- Unit: `colorForFiber` cubre casos borde (1, 12, 13, 144, inválidos) y `pointSQL`/`lineStringSQL` validación de rangos y SRID.
- E2E: skeleton para flujo 1 (crear caja desde mapa) y flujo 6 (aislamiento) — `test.skip` hasta Sprint 4 cuando el seed cree 2 orgs.
- `playwright.config.ts` con webserver auto-spawn.

### ADRs
- ADR-016 · Dibujo en mapa con `terra-draw`.
- ADR-017 · Tiles MapTiler en producción.

## Decisiones tomadas fuera del blueprint

1. **`fn_generate_short_id()` con alfabeto sin ambiguos** (sin I, O, 0, 1). El blueprint dice "8 chars [A-Z0-9]" — lo reduzco a 32 caracteres para evitar confusión al leer QR impreso a mano. Documentado en la SQL.
2. **Fallback MapTiler a tiles demo** cuando la key no existe, para que Sprint 2 sea arrancable sin cuenta externa. UI muestra aviso amarillo; no se usa en producción.
3. **`boxes.version` como campo obligatorio desde Sprint 2** (aunque el LWW PWA vive en Sprint 5) — evita una migración posterior que tocaría todas las filas.

## Bloqueadores / dependencias externas

- `MAPTILER_API_KEY` (§28) → necesario para ver el mapa con calidad real; free tier 100k tiles/mes.
- `/etc/hosts` local debe incluir `demo.fibraos.local` para probar el tenant.
- Para correr E2E en CI: los skeletons actuales están con `test.skip`; habilitarlos requiere un fixture de seed determinista (Sprint 4).

## Definition of Done

- [x] Schema completo aplicable con `pnpm db:push && pnpm db:sql`.
- [x] Seed crea 16 cajas y 15 cables con fibras correctas (TIA-598-C).
- [x] `/boxes` lista con filtros y paginación básica.
- [x] `/boxes/new?lat=&lng=` rellena el form preset.
- [x] `/map` muestra markers clusterizados y cables con grosor/color correctos.
- [x] Pin-mode navega a `/boxes/new` con coordenadas.
- [x] `/cables/draw` permite dibujar polilínea y crear cable con N fibras en una transacción.
- [x] Tests unit de color y postgis verdes.
- [x] ADR-016, ADR-017 escritas.

## Siguientes pasos (Sprint 3)

1. Schema `splitters`, `splitter_ports`, `fusions`, `fusion_endpoints`.
2. Triggers `fn_sync_fusion_endpoints` y `fn_set_fiber_status_on_fusion`.
3. `InternalDiagram.tsx` con React Flow: bandejas, splitters, cables-entrada, fibras.
4. Modo ver vs editar; crear fusión por drag entre dos nodos válidos.
5. Validación cliente+servidor con `canFuse`.
6. Virtualización para cables de 144 fibras.
7. ADR-004 "Modelo simétrico de fusiones".
8. Tests E2E flujo 3.
