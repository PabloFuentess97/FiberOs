# ADR-005: Trazado de impacto con CTE recursivo en Postgres

- Status: accepted
- Date: 2026-04-23
- Sprint: 4

## Contexto

Cuando se corta un cable o fibra, necesitamos saber qué clientes quedan sin servicio.
El grafo de la red tiene nodos heterogéneos (fibras, puertos de splitter) conectados por
fusiones. Un splitter 1x8 es un nodo especial: la señal del input se replica en los 8
outputs (broadcast óptico). Dos opciones reales:

1. **Calcular en app**: cargar todas las fibras + fusiones + splitters del tenant y hacer BFS en memoria.
2. **Calcular en BD**: CTE recursivo con closure transitivo.

Opción 1 es portable pero escala mal: con ~10k fibras y ~3k fusiones el payload y la RAM se disparan. Opción 2 se queda en el planificador de Postgres.

## Decisión

Implementar `computeImpact(input)` (`lib/db/queries/impact.ts`) con un CTE recursivo que:

1. **Seed según tipo de entrada** (cable / fiber / box).
2. **Closure transitivo** en dos pasos dentro del mismo CTE:
   - Propagación por fusión: si el nodo actual está en una fusión, el otro extremo también queda alcanzado.
   - Broadcast por splitter: si se alcanza cualquier puerto de un splitter, todos los demás puertos del mismo splitter quedan alcanzados (modelo simplificado de broadcast input↔outputs).
3. `UNION` (no `UNION ALL`) **deduplica automáticamente**; Postgres termina la recursión cuando no hay nuevas filas → **anti-ciclo implícito** sin necesidad de un `visited` explícito.
4. La query final filtra a solo fibras (`kind = 'fiber'`) y JOIN contra `clients.drop_fiber_id` para listar a los usuarios finales afectados.

## Consecuencias

- **Pros:**
  - Un único round-trip: BD devuelve filas ya filtradas por tenant (RLS aplica vía `SET LOCAL`).
  - El planificador usa los índices existentes (`fusion_endpoints_fiber_unique`, `splitter_ports_splitter_idx`).
  - Deduplicación gratis con `UNION`.
  - `SELECT COUNT(*)` sobre `clients` impactados es sub-segundo hasta decenas de miles de fibras.

- **Cons / trade-offs:**
  - Menos portable: atado a Postgres. Aceptable dado ADR-001.
  - Broadcast de splitter es **simplificado**: modelamos input↔outputs como biyección de alcanzabilidad. En realidad el ratio óptico reduce potencia, pero para "qué clientes pierden servicio" la alcanzabilidad topológica basta.
  - Testeable solo contra Postgres real (no con pg-mem). Los tests canónicos se añaden con testcontainers en Sprint 8.

## Alternativas consideradas

| Alternativa | Por qué descartada |
|---|---|
| BFS en app JS | Payload y RAM explotan con topologías reales (~10k fibras por tenant mediano). |
| Vista materializada con closure pre-calculado | Invalidación compleja con cada fusión creada/borrada. Recompute en cada corte es más barato que mantener la tabla sincronizada. |
| Graph DB (Neo4j) | Añade un servicio más al stack; contradice ADR-001 (single Postgres). |
| CTE sin splitter-broadcast | Pierde la semántica óptica: input de un splitter sin reflejar los outputs da respuestas incorrectas. |
| `UNION ALL` con tabla visited | Innecesario: UNION deduplica y Postgres termina solo. |

## Validación

El DoD del Sprint 4 pide "cortar un troncal específico devuelve la lista exacta de clientes colgando aguas abajo". La topología del seed permite validar manualmente:

- Cortar `CBL-MT-ALB` (48f) debería listar todos los clientes bajo `MT-ALBAICIN-01 → ST-ALB-001/002 → CTO-ALB-*`.
- Cortar una fibra output individual de `SPL-ALB-A` debería listar solo los clientes cuyo drop cuelga de esa fibra.

Tests automatizados bloqueados hasta testcontainers (Sprint 8); documentamos las expectativas en `tests/unit/impact.test.ts` (suite skipeada) y en `tests/e2e/impact.spec.ts` (flujo 5).
