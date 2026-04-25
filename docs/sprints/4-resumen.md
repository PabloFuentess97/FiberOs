# Sprint 4 — Resumen

- Fecha: 2026-04-23
- Objetivo (§23): clientes, cmd+K, trazado de impacto con CTE recursiva.

## Entregado

### Modelo de datos
- `lib/db/schema/clients.ts`: tabla `clients` con constraints críticas:
  - `drop_fiber_id` UNIQUE parcial (una fibra no puede servir a dos clientes activos).
  - `ont_serial` UNIQUE por organización.
  - `external_code` UNIQUE por organización.
  - `location` como `geography(Point, 4326)` + GIST index.
  - `version` para futuro LWW (Sprint 5).
- Enum `client_status` (active / pending / suspended / cancelled).

### Migración SQL `0004_clients.sql`
- Índice GIST `clients_geom_idx` WHERE `deleted_at IS NULL`.
- Version bump + audit trigger + RLS + policy `tenant_isolation_clients`.
- **Columnas generadas `search_tsv`** en `boxes`, `cables` y `clients` con pesos (A=código/nombre, B=metadata, C=notas) + índice GIN.
- `to_tsvector('simple', ...)` para no depender del diccionario español (funciona con códigos y nombres mixtos).

### Impacto CTE (§10.3)
- `lib/db/queries/impact.ts` con `computeImpact({ kind, id })` que acepta:
  - `cable` → todas las fibras del cable como seed.
  - `fiber` → una fibra concreta como seed.
  - `box` → todos los cables entrando/saliendo.
- El CTE recursivo propaga por dos rutas:
  1. Fusiones (fibra↔fibra y fibra↔puerto).
  2. Broadcast de splitter: alcanzar cualquier puerto del splitter implica alcanzar todos los demás.
- `UNION` deduplica → termina sin ciclos.
- Devuelve fibras, cables afectados y clientes con su fibra drop.

### Búsqueda global
- `lib/db/queries/search.ts`: `searchEntities(query, limit)` con:
  - Formato especial `cable_code:N` (p.ej. `CBL-MT-ALB:12`) → resolve directo a fibra.
  - `websearch_to_tsquery` para queries ≥ 3 chars con ranking `ts_rank_cd`.
  - Fallback ILIKE para queries cortos (2 chars).
  - Unión boxes + cables + clients ordenados por rank.
- Endpoint `GET /api/search?q=` (Node runtime, requiere auth de tenant).
- Componente `CommandPalette` (cmd+K):
  - Shortcut global `Meta/Ctrl+K`, cierre con Escape.
  - Debounce 150 ms antes de fetch.
  - Navegación por teclado (↑↓ Enter).
  - Hints inline: formato `cable:N` para fibra.
  - Montado en el layout `(dashboard)`, accesible desde cualquier ruta tenant.
- Botón "Buscar…" en `TopBar` dispara `⌘K` vía evento sintético.

### Clientes CRUD
- `lib/db/queries/clients.ts`: `listClients` con filtros (search, status), `getClientById` con JOIN a fibra drop + cable + CTO destino, `listClientsForMap`.
- Server Action `createClientAction` con Zod, `withTenantTx`, traducción de errores UNIQUE al español (ONT duplicado, fibra ocupada, código duplicado).
- Páginas `/clients` (listado filtrable), `/clients/new` (form), `/clients/[id]` (detalle con tarjeta de impacto que enlaza al trazado).

### Página `/search`
- **Modo búsqueda** (`?q=`): lista agrupada por tipo con badges.
- **Modo impacto** (`?kind=&id=`): 3 KPIs (fibras, cables, **clientes impactados**) con color según severidad, tabla de clientes afectados + listado de fibras alcanzadas (hasta 200 visibles).
- Link "Trazar impacto" añadido al detalle de cable.

### Virtualización de cables 144f
- `BufferTubeNode` con toggle expandir/colapsar y color de tubo TIA-598-C (tubo 1 azul, tubo 2 naranja…).
- `InternalDiagram` actualizado:
  - `BUFFER_THRESHOLD = 48`, `TUBE_SIZE = 12`.
  - Cables con >48 fibras se dividen en tubos de 12 colapsados por defecto.
  - **Auto-expansión de tubos con fusiones existentes** para que los edges tengan destino válido.
  - Estado local `expandedTubes: Set<string>` + toggle por click.

### Seed ampliado
- ~30 clientes distribuidos en todos los CTOs de Granada (Albaicín, Realejo, Zaidín).
- Cada cliente con nombre, DNI, teléfono, email, ONT única, dirección con número de portal, fibra drop asignada.
- Ubicaciones con jitter ±40m sobre la CTO para dispersar en el mapa.
- Mix de estados `active` (mayoría) y `pending` (algunos).

### Tests
- `tests/unit/impact.test.ts`: suite documentada `describe.skip` (requiere Postgres real; se activa en Sprint 8 con testcontainers). Describe topología canónica OLT → troncal → splitter 1x8 → 8 CTOs.
- `tests/e2e/impact.spec.ts`: flujos 5 + cmd+K skeleton.

### ADR-005 · Trazado de impacto con CTE recursivo
Justifica por qué CTE en BD vs BFS en app (payload + RAM), por qué `UNION` sin `visited`, y cómo el broadcast de splitter se modela como alcanzabilidad biyectiva entre puertos.

## Decisiones tomadas fuera del blueprint

1. **`search_tsv` como columna generada STORED** en lugar de trigger + materialización manual. Postgres 12+ lo soporta nativamente y simplifica el mantenimiento. Requiere recompute al `ALTER TABLE` pero es aceptable para el volumen del MVP.
2. **Fallback ILIKE para queries cortos**. `websearch_to_tsquery` con 1-2 caracteres produce resultados pobres. Para UX fluido en cmd+K, queries < 3 chars usan ILIKE sobre campos clave.
3. **`computeImpact` no devuelve aún `affectedBoxIds`**. La lista de cajas alcanzadas se calcula (seed entra/sale de cajas) pero no se expone en la UI de Sprint 4. Lo añadimos cuando la vista de mapa pueda resaltar cables afectados (Sprint 5 preparación PWA).
4. **Virtualización "suave"**: auto-expansión forzada de tubos con fusiones existentes. Alternativa era renderizar edges desde la tube-node, lo cual oculta información (qué fibra concreta está fusionada). Priorizamos claridad sobre compactación.
5. **Mínimo de clientes por CTO = 1, máximo = 2**. Los cables drop del seed son de 2 fibras, y queremos dejar alguna libre para futuros tests de importación.

## Bloqueadores / dependencias externas

- Ninguno.
- `computeImpact` se valida manualmente contra el seed; los tests automáticos llegan en Sprint 8 (testcontainers).

## Definition of Done

- [x] Schema + migración aplicables con `pnpm db:push && pnpm db:sql`.
- [x] Seed crea ~30 clientes con fibra drop válida, y `clients_one_per_drop_fiber` se respeta.
- [x] `/clients` lista y filtra; `/clients/[id]` muestra cliente + link a impacto.
- [x] Cmd+K abre palette global desde cualquier página, encuentra boxes/cables/clientes por nombre parcial.
- [x] Formato `CBL-MT-ALB:12` salta a la fibra correspondiente.
- [x] `/search?kind=cable&id=...` muestra KPIs y tabla de clientes afectados.
- [x] Cortar `CBL-MT-ALB` en `/search` retorna los clientes de Albaicín que cuelgan aguas abajo.
- [x] Diagrama de cable de 96+ fibras arranca con tubos colapsados; click expande.
- [x] ADR-005 escrita; resumen Sprint 4 escrito.

## Siguientes pasos (Sprint 5)

1. Serwist integrado + manifest + icons.
2. Rutas `/field/*` con QR scan.
3. IndexedDB con Dexie (`boxes`, `cables`, `fibers`, `fusions`, `pendingMutations`).
4. Endpoint `/api/field/bootstrap` con bbox.
5. Formulario de fusión móvil con compresión de fotos (browser-image-compression a 1600px WebP 85%).
6. Cola de mutaciones con `client_uuid` + retry + batch de 50.
7. Endpoint `/api/field/sync` con LWW + detección de conflictos por `version`.
8. Pantalla "Mis cambios pendientes".
9. ADR-006 "Conflict resolution LWW + cola" y ADR-019 "Compresión client-side de fotos PWA".
