# ADR-004: Modelo simétrico de fusiones (`fusion_endpoints` UNIQUE)

- Status: accepted
- Date: 2026-04-23
- Sprint: 3

## Contexto

Una fusión óptica conecta dos extremos. Cada extremo puede ser una fibra (de un cable) o
un puerto de splitter. Hay dos invariantes no negociables:

1. **Un extremo solo puede estar en una fusión.** Fusionar dos veces la misma fibra es físicamente imposible.
2. **La fusión es simétrica.** No hay "extremo fuente" y "extremo destino" — ambos son equivalentes.

Modelar esto en una sola tabla `fusions(endpoint_a_*, endpoint_b_*)` con columnas polimórficas
(fiber_id o splitter_port_id) es ergonómico para consultas, pero expresar la unicidad sobre
"cualquier endpoint" requiere algo más.

## Decisión

**Dos tablas coordinadas por trigger:**

- `fusions`: una fila por fusión con `endpoint_a_kind`, `endpoint_a_fiber_id`, `endpoint_a_splitter_port_id`, `endpoint_b_*` y CHECK constraints que fuerzan el shape (exactamente uno de fiber_id/splitter_port_id no-null, según kind).
- `fusion_endpoints`: vista materializada mantenida por trigger `fn_sync_fusion_endpoints()`. Dos filas por fusión (una por endpoint) con `UNIQUE (fiber_id) WHERE fiber_id IS NOT NULL` y `UNIQUE (splitter_port_id) WHERE splitter_port_id IS NOT NULL`. Cualquier intento de fusionar dos veces un mismo extremo falla con violación de unique.

**Triggers Postgres ordenados** (los AFTER corren alfabéticamente por nombre):
- `trg_a_sync_fusion_endpoints`: sincroniza la tabla desnormalizada.
- `trg_b_set_fiber_status`: actualiza `fibers.status` a `fused`/`free` al insertar/borrar. Consulta `fusion_endpoints` ya actualizada por el trigger anterior.

**Validación en cliente y servidor** via `canFuse(a, b)` (`lib/network/fusion.ts`):
- Misma organización, misma caja, ningún extremo ya fusionado.
- No autofusión, no dos inputs de splitter.
- Warning (no bloqueo) si dos fibras pertenecen al mismo cable.

React Flow usa `isValidConnection` para deshabilitar el drag hacia handles inválidos en tiempo real.

## Consecuencias

- **Pros:**
  - La base de datos es incorruptible: aunque la app tenga un bug, Postgres rechaza cualquier
    doble fusión con `23505 unique_violation`.
  - Mismo `canFuse` en cliente (UX: bloquea drag) y servidor (defensa): una sola fuente de verdad.
  - Consultas frecuentes ("¿está esta fibra fusionada?") son O(1) contra `fusion_endpoints.fiber_id`.
  - Modelo simétrico: no hay que normalizar "A, B" antes de comparar.

- **Cons / trade-offs:**
  - Dos tablas coordinadas = complejidad. Mitigado con trigger testeable y comentarios en SQL.
  - UPDATE de fusions regenera las dos filas de fusion_endpoints. Con ~miles de fusiones no es
    problema; con millones hay que vigilar.
  - Ordenación alfabética de triggers `trg_a_...`/`trg_b_...` es frágil si alguien añade un
    trigger con nombre intermedio. Documentado en el SQL.

## Alternativas consideradas

| Alternativa | Por qué descartada |
|---|---|
| Columna genérica `endpoint_id + endpoint_kind` sin tabla auxiliar | Postgres no permite UNIQUE sobre columnas polimórficas directamente; habría que serializar a texto o usar índices parciales complejos. |
| Dos tablas por tipo (`fiber_fusions`, `port_fusions`) | Fragmenta la lógica de "cualquier fusión de esta caja" en UNION queries; pierde simetría. |
| UUID compuesto (LEAST(a,b), GREATEST(a,b)) como unique key | Funciona solo cuando los dos endpoints son del mismo tipo. Con mezcla fibra/puerto no hay orden comparable natural. |
| Lógica exclusivamente en app, sin triggers | Fuga de integridad ante bug/race condition. Contradice ADR-002 (doble cinturón). |
| Soft delete en fusion_endpoints en vez de DELETE | Añade complejidad sin beneficio; la fusión física no tiene "estado intermedio". |
