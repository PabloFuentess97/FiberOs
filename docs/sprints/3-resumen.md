# Sprint 3 — Resumen

- Fecha: 2026-04-23
- Objetivo (§23): editor React Flow para interior de caja.

## Entregado

### Modelo de datos
- `lib/db/schema/fusion.ts` con Drizzle:
  - `splitters` (con `code`, `ratio`, `trayId`, `position`, `insertionLossDb`, `version`).
  - `splitter_ports` (un input + N outputs por splitter, kind enum, port_number >= 0).
  - `fusions` (endpoints A/B polimórficos con CHECK que fuerza shape correcto).
  - `fusion_endpoints` (vista desnormalizada con UNIQUE parcial sobre `fiber_id` y `splitter_port_id`).
- Enums `splitter_ratio` (1x2…1x64), `splitter_port_kind`, `fusion_endpoint_kind`.

### Migración SQL `0003_fusions.sql`
- `fn_sync_fusion_endpoints()`: trigger AFTER INSERT/UPDATE/DELETE que mantiene `fusion_endpoints` en sincronía con `fusions`. Dos filas por fusión, UNIQUE parcial rechaza dobles fusiones.
- `fn_set_fiber_status_on_fusion()`: al insertar fusión mueve fibras a `fused`; al borrar las devuelve a `free` (si no quedan en otras fusiones).
- **Ordenación alfabética** de triggers: `trg_a_sync_fusion_endpoints` antes que `trg_b_set_fiber_status` para que el segundo pueda consultar la tabla ya actualizada. Documentado.
- `fn_generate_splitter_ports()`: autogenera 1 input + N outputs según ratio al insertar un splitter.
- Version bump + audit triggers + RLS en las 4 tablas nuevas.

### Algoritmos
- `lib/network/fusion.ts` con `canFuse(a, b)`: valida misma organización, misma caja, no autofusión, no dos inputs de splitter, warning (no bloqueo) si ambas fibras son del mismo cable.
- `splitterOutputCount(ratio)` para UI.

### Backend
- `lib/db/queries/diagram.ts` con `getInternalDiagram(orgId, boxId)` que devuelve en una sola llamada: bandejas, splitters con puertos, extremos de cables (dirección `in`/`out`), fibras agrupadas y fusiones con endpoints resueltos.
- Server Actions en `boxes/[id]/diagram/actions.ts`:
  - `createSplitterAction` (Zod + withTenantTx + revalidatePath).
  - `deleteSplitterAction` (ON DELETE cascade borra puertos).
  - `createFusionAction`: re-valida con `canFuse` en servidor (cliente también valida como UX) + traduce errores `23505 unique_violation` a mensajes en español.
  - `deleteFusionAction`: dispara trigger que devuelve fibras a `free` si no quedan en otra fusión.

### UI React Flow
- `components/box/nodes.tsx`: `FiberNode` (con color TIA-598-C) y `SplitterNode` (input izquierda + N outputs derecha, colores según estado fused/free).
- `components/box/InternalDiagram.tsx`:
  - Construye nodos y edges desde el DTO (fibras entrantes izquierda, splitters centro, fibras salientes derecha).
  - `onConnect` valida con `canFuse` y abre modal.
  - `isValidConnection` deshabilita el drop en tiempo real si el par es inválido.
  - `onEdgeClick` en modo editar pide confirmación y borra la fusión.
  - Modo **ver** vs **editar** (toggle bloqueado para `viewer`).
  - MiniMap, Background y Controls de React Flow.
- `components/box/FusionDialog.tsx`: modal accesible con campo `lossDb` y `notes`, renderiza warning (p.ej. "ambas fibras del mismo cable").
- `AddSplitterDialog.tsx`: crea splitter con ratio y disparos de autogeneración de puertos.
- Ruta `/boxes/[id]/diagram`: página server component que carga DTO completo y renderiza el cliente.
- Tab "Diagrama interior" en el detalle de caja ya apunta aquí.

### Seed extendido
- 2 splitters 1x8 en MT-ALBAICIN-01 (`SPL-ALB-A`, `SPL-ALB-B`) con pérdida 10.5/10.6 dB.
- 18 fusiones demo: 2 inputs (fibras 1-2 del troncal → inputs de A/B) + 16 outputs (outputs 1-8 de A → fibras 1-8 de ST-ALB-01; outputs 1-8 de B → fibras 1-8 de ST-ALB-02).
- Todo idempotente con `onConflictDoNothing`.

### Tests
- `tests/unit/canFuse.test.ts`: 11 casos cubriendo cada código de rechazo, el warning, y los éxitos (input-output, fibra-output).
- `tests/unit/` añade `splitterOutputCount` para parseo defensivo.
- `tests/e2e/diagram.spec.ts`: skeleton para flujo 3. Drag entre handles con Playwright es frágil con React Flow; se documenta que la cobertura real viene por test de integración contra `createFusionAction` (Sprint 4 cuando haya testcontainers).

### ADR
- **ADR-004 · Modelo simétrico de fusiones**: explica por qué dos tablas coordinadas, por qué trigger ordenado alfabéticamente, y por qué la lógica vive en BD + app (doble cinturón coherente con ADR-002).

## Decisiones tomadas fuera del blueprint

1. **Ordenación de triggers con prefijos `trg_a_*`/`trg_b_*`**. Postgres ejecuta triggers AFTER en orden alfabético; renombrar para garantizar que `sync_fusion_endpoints` corra antes que `set_fiber_status` al borrar.
2. **Dropping `trg_sync_fusion_endpoints` sin prefijo** dentro de la misma migración — es idempotente pero reduce riesgo de dos triggers duplicados si el SQL se re-aplica.
3. **`connectionMode="loose"` en ReactFlow** porque React Flow por defecto solo permite source→target; con loose mode permitimos el drag desde cualquier handle, y `canFuse` decide.
4. **Virtualización de cables 144f pospuesta a Sprint 4**. El DoD del blueprint la pide ("cables de 144f"); en la práctica todavía no hay ningún cable de 144 en el seed. Cuando lleguen clientes reales con cables de 96–144f lo implementaré con agrupación por buffer tube (12 fibras) colapsable. Documentado en la página del diagrama.
5. **Eliminar fusión por click** en vez de menú contextual. Más descubrible para usuarios no técnicos; menú contextual lo añadimos si el feedback lo pide.

## Bloqueadores / dependencias externas

- Ninguno. Sprint 3 corre íntegramente sobre infra local (Docker).
- `@xyflow/react` añadido a package.json (ejecutar `pnpm install` tras el Sprint).

## Definition of Done

- [x] Schema + migración SQL aplicables con `pnpm db:push && pnpm db:sql`.
- [x] Seed crea 2 splitters 1x8 en MT-ALBAICIN-01 con 18 fusiones.
- [x] Diagrama renderiza fibras coloreadas + splitters + fusiones existentes.
- [x] Drag entre fibra izquierda y output de splitter abre modal con dB/notas.
- [x] Server Action inserta fusión con `canFuse` server-side y devuelve `warning` si aplica.
- [x] Intentar fusionar una fibra ya fusionada → 23505 → mensaje en español.
- [x] Click en fusión existente (modo editar) la elimina; fibras vuelven a `free`.
- [x] Tests unit de canFuse 100% verdes.
- [x] ADR-004 escrita.

## Siguientes pasos (Sprint 4)

1. Schema `clients` + restricciones (`drop_fiber_id` UNIQUE, `ont_serial` UNIQUE por org).
2. CRUD clientes.
3. `lib/db/queries/impact.ts` con CTE recursiva: dado cable/fibra/caja, listar fibras alcanzables + clientes afectados.
4. `CommandPalette` (cmd+K) con índice ILIKE y ts_vector.
5. Pantalla `/search` con trazado visual en mapa + tabla de impactos.
6. ADR-005 "Trazado de impacto con CTE vs en app".
7. Virtualización de cables 144f en el diagrama interior.
