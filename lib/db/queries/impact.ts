import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

export type ImpactEntryKind = "cable" | "fiber" | "box";

export interface ImpactInput {
  kind: ImpactEntryKind;
  id: string;
}

export interface AffectedClient {
  id: string;
  name: string;
  address: string;
  externalCode: string | null;
  status: string;
  fiberId: string;
  cableCode: string;
  fiberNumber: number;
}

export interface AffectedFiber {
  fiberId: string;
  cableId: string;
  cableCode: string;
  number: number;
  color: string;
}

export interface ImpactResult {
  input: ImpactInput;
  fibers: AffectedFiber[];
  clients: AffectedClient[];
  affectedCableIds: string[];
  affectedBoxIds: string[];
}

/**
 * Trazado de impacto con CTE recursivo.
 *
 * Dado un punto de entrada (cable, fibra o caja) devuelve:
 *   - las fibras alcanzables siguiendo fusiones (fibra↔fibra y fibra↔puerto_splitter con
 *     broadcast a los outputs del splitter),
 *   - los clientes cuyo `drop_fiber_id` está en ese conjunto.
 *
 * Reglas de propagación óptica:
 *   1. De una fibra puedes llegar a su "vecino" vía cualquier fusión que la contenga.
 *      - Si el vecino es otra fibra → añadir al conjunto.
 *      - Si es un puerto de splitter:
 *          - Si el puerto es INPUT del splitter → todos los OUTPUT del splitter también
 *            están alcanzados (broadcast).
 *          - Si el puerto es OUTPUT → el INPUT del splitter está alcanzado (aguas arriba).
 *   2. Desde un puerto alcanzado, cada fusión que lo contiene propaga a su otro extremo.
 *   3. UNION (no UNION ALL) termina cuando no hay nuevas filas (anti-ciclo implícito).
 *
 * El seed inicial depende del kind:
 *   - cable → todas las fibras del cable.
 *   - fiber → esa fibra.
 *   - box   → todas las fibras de cables con source_box_id = box o target_box_id = box
 *             (equivale a "cortamos todo dentro de esa caja").
 *
 * Requiere `SET LOCAL app.organization_id` vía `withTenantTx` para RLS.
 */
export async function computeImpact(input: ImpactInput): Promise<ImpactResult> {
  // El CTE combina nodos (fibras + puertos de splitter). Usamos columnas uniformes
  // (kind, id) en el worktable. La expansión por splitter se hace con un segundo paso
  // dentro del CTE: cuando llegamos a un puerto, añadimos todos los puertos hermanos
  // del mismo splitter como "implícitamente alcanzados" (luego sus fusiones propagan).
  //
  // Estructura del worktable:
  //   { kind: 'fiber' | 'splitter_port', id: uuid }

  const rows = await db.execute<{
    fiber_id: string;
    cable_id: string;
    cable_code: string;
    fiber_number: number;
    fiber_color: string;
  }>(sql`
    WITH RECURSIVE
    -- 1. Seed según tipo de entrada
    seed_nodes AS (
      SELECT 'fiber'::text AS kind, f.id AS id
        FROM fibers f
        INNER JOIN cables c ON c.id = f.cable_id
        WHERE
          (${input.kind} = 'cable' AND f.cable_id = ${input.id}::uuid)
          OR
          (${input.kind} = 'fiber' AND f.id = ${input.id}::uuid)
          OR
          (${input.kind} = 'box' AND (c.source_box_id = ${input.id}::uuid OR c.target_box_id = ${input.id}::uuid))
    ),
    -- 2. Closure recursivo: propaga por fusiones + broadcast por splitter
    reachable AS (
      SELECT kind, id FROM seed_nodes
      UNION
      -- vecino directo por fusión (a partir de una fibra)
      SELECT fe_b.kind, COALESCE(fe_b.fiber_id, fe_b.splitter_port_id) AS id
        FROM reachable r
        INNER JOIN fusion_endpoints fe_a
          ON (fe_a.kind = r.kind
              AND ((r.kind = 'fiber' AND fe_a.fiber_id = r.id)
                OR (r.kind = 'splitter_port' AND fe_a.splitter_port_id = r.id)))
        INNER JOIN fusion_endpoints fe_b
          ON fe_b.fusion_id = fe_a.fusion_id
         AND NOT (fe_b.kind = fe_a.kind
                  AND COALESCE(fe_b.fiber_id, fe_b.splitter_port_id) = r.id)
      UNION
      -- broadcast por splitter: llegar a INPUT implica alcanzar todos los OUTPUT, y viceversa
      SELECT 'splitter_port'::text, sp2.id
        FROM reachable r
        INNER JOIN splitter_ports sp1
          ON sp1.id = r.id AND r.kind = 'splitter_port'
        INNER JOIN splitter_ports sp2
          ON sp2.splitter_id = sp1.splitter_id AND sp2.id <> sp1.id
    ),
    -- 3. Filtrar a solo fibras
    reachable_fibers AS (
      SELECT id AS fiber_id FROM reachable WHERE kind = 'fiber'
    )
    SELECT
      rf.fiber_id            AS fiber_id,
      f.cable_id             AS cable_id,
      c.code                 AS cable_code,
      f.number               AS fiber_number,
      f.color::text          AS fiber_color
    FROM reachable_fibers rf
    INNER JOIN fibers f ON f.id = rf.fiber_id
    INNER JOIN cables c ON c.id = f.cable_id
    ORDER BY c.code, f.number;
  `);

  const fibers: AffectedFiber[] = rows.map((r) => ({
    fiberId: r.fiber_id,
    cableId: r.cable_id,
    cableCode: r.cable_code,
    number: r.fiber_number,
    color: r.fiber_color,
  }));

  const fiberIds = fibers.map((f) => f.fiberId);

  const clients =
    fiberIds.length === 0
      ? []
      : await db.execute<{
          id: string;
          name: string;
          address: string;
          external_code: string | null;
          status: string;
          drop_fiber_id: string;
          cable_code: string;
          fiber_number: number;
        }>(sql`
          SELECT
            cl.id,
            cl.name,
            cl.address,
            cl.external_code,
            cl.status::text AS status,
            cl.drop_fiber_id,
            c.code  AS cable_code,
            f.number AS fiber_number
          FROM clients cl
          INNER JOIN fibers f ON f.id = cl.drop_fiber_id
          INNER JOIN cables c ON c.id = f.cable_id
          WHERE cl.deleted_at IS NULL
            AND cl.drop_fiber_id IN ${fiberIds}
          ORDER BY cl.name;
        `);

  const affectedClients: AffectedClient[] = clients.map((c) => ({
    id: c.id,
    name: c.name,
    address: c.address,
    externalCode: c.external_code,
    status: c.status,
    fiberId: c.drop_fiber_id,
    cableCode: c.cable_code,
    fiberNumber: c.fiber_number,
  }));

  const affectedCableIds = [...new Set(fibers.map((f) => f.cableId))];
  const affectedBoxIds: string[] = []; // futuro: cajas alcanzadas para resaltar en mapa

  return {
    input,
    fibers,
    clients: affectedClients,
    affectedCableIds,
    affectedBoxIds,
  };
}
