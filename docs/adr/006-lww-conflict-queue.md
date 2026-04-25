# ADR-006: Conflict resolution LWW + cola de conflictos

- Status: accepted
- Date: 2026-04-23
- Sprint: 5

## Contexto

Un técnico puede trabajar sin conexión durante horas. Edita cajas, registra
fusiones, actualiza clientes. Al recuperar red, sus mutaciones deben fundirse
con el estado del servidor — que pudo cambiar entretanto (otro técnico, un
admin desde el dashboard). Necesitamos una política de resolución clara.

## Decisión

**Last-Writer-Wins (LWW) con vector de versión por entidad + cola de
conflictos para intervención humana.**

### 1. Versión por entidad

Cada entidad editable desde la PWA tiene una columna `version INT` que se
autoincrementa vía trigger `fn_bump_version` (Sprint 2).

### 2. Flujo de sync

El cliente envía cada mutación con `clientVersion`: la versión del registro
que vio al editar.

- **create** → sin `clientVersion`. Aplicar si no hay colisión por UNIQUE.
- **update / delete** → con `clientVersion`. Servidor compara:
  - `clientVersion == serverVersion` → **aplicar** (LWW trivial).
  - `clientVersion != serverVersion` → **conflicto**: otra sesión modificó la
    entidad entre la lectura offline y el sync. Se archiva en
    `field_sync_queue` con `status='conflict'` + `conflict_server_version` +
    `payload` original.

### 3. Excepción para fusiones

Las fusiones **no usan version**: su unicidad la garantiza el UNIQUE parcial
sobre `fusion_endpoints` (ADR-004). Si otra sesión fusionó el mismo extremo
primero, el insert falla con `fusion_endpoints_fiber_unique` y devolvemos
`status=rejected` con error `already_fused` — el técnico ve que su fusión no
entró y decide.

### 4. Idempotencia por `(device_id, client_uuid)`

Cada mutación local nace con un UUID v4. La tabla `field_sync_queue` tiene
`UNIQUE (device_id, client_uuid)`. Si el cliente reintenta (red flaky), el
servidor detecta la entrada previa y devuelve `status=noop` sin duplicar.

### 5. Resolución humana de conflictos

La PWA muestra en `/field/pending` las mutaciones con `status=conflict`:

- **Forzar (descarta versión local)**: re-encola la mutación con
  `clientVersion=null` → el siguiente sync sobrescribe el servidor (LWW puro).
- **Descartar**: borra la mutación de la cola.

No implementamos "merge automático" en el MVP. La UX explícita es preferible
a un merge silencioso que pierde datos.

## Consecuencias

- **Pros:**
  - Semántica predecible: el último que escribe gana, salvo que veas el
    conflicto y decidas lo contrario.
  - Sin CRDTs ni Operational Transforms — complejidad proporcional al
    problema. En FTTH la concurrencia real es baja.
  - `client_uuid` + UNIQUE hace el sync **idempotente**: reintentos infinitos
    son seguros.
  - `field_sync_queue` es auditable: admin puede ver histórico de sync por
    técnico.

- **Cons / trade-offs:**
  - Updates parciales: si técnico A edita `notes` y técnico B edita
    `address`, LWW pisa uno de los dos aunque el merge natural fuera unir
    ambos. Aceptable: son campos que raramente cambian en paralelo.
  - No resolvemos automáticamente "dos técnicos crean la misma fusión": la
    segunda llega como `rejected/already_fused`. El ganador es quien sube
    primero (FIFO de sync).
  - `version` solo cubre entidades listadas. Si añadimos edición PWA de
    splitters (fuera del MVP), hay que añadir `version` y trigger.

## Alternativas consideradas

| Alternativa | Por qué descartada |
|---|---|
| CRDT (Yjs, Automerge) | Complejidad enorme para un dominio con bajísima concurrencia real (1-2 técnicos por zona). |
| Operational Transform | Mismo argumento. |
| Last-server-write-wins sin version | Pierde datos silenciosamente — inaceptable para inventario de red. |
| Merge server-side por campo | Buena idea para texto libre, pero requiere diff inteligente. Pospuesto. |
| Tombstones para deletes | No relevante en MVP; no permitimos delete offline de cajas/clientes (solo soft delete desde dashboard). |
