import { describe, it, expect } from "vitest";

/**
 * Tests de integración de `computeImpact` contra BD efímera.
 *
 * NOTA: El CTE recursivo requiere Postgres real (PostGIS + extensiones).
 * Esta suite está `describe.skip` hasta que habilitemos testcontainers en
 * CI (planificado para Sprint 8). Documentamos aquí las topologías esperadas.
 *
 * Topología canónica (§10.3):
 *
 *   OLT ── troncal96 ── MT-HUB ── troncal48 ── MT-BRANCH
 *                                                 │
 *                                    ┌────────────┼────────────┐
 *                                 splitter-A (1x8)             │
 *                                    │                         │
 *                          ┌─────────┴─────────┐            subtrunk
 *                          │ ... 8 outputs ... │
 *                          ▼                   ▼
 *                        CTO-1 ··· CTO-8 (cada uno con 1 cliente)
 *
 * Esperado:
 *   - Cortar `troncal96` → 8 clientes afectados.
 *   - Cortar `troncal48` → 8 clientes afectados.
 *   - Cortar una sola fibra output del splitter → 1 cliente.
 *   - Cortar fibra-input del splitter → 8 clientes (broadcast).
 */
describe.skip("computeImpact (requiere Postgres real)", () => {
  it("cortar troncal aguas arriba: devuelve todos los clientes colgando", async () => {
    // fixture: crear topología OLT → splitter 1x8 → 8 CTOs → 8 clientes
    // const r = await computeImpact({ kind: "cable", id: troncalId });
    // expect(r.clients).toHaveLength(8);
  });

  it("cortar output individual de splitter: 1 cliente", async () => {
    // const r = await computeImpact({ kind: "fiber", id: outputFiberId });
    // expect(r.clients).toHaveLength(1);
  });

  it("no hay ciclos infinitos con fusiones cruzadas entre dos cables", async () => {
    // UNION en la CTE deduplica; el test asegura que el computeImpact termina.
  });

  it("entrada 'box': devuelve impacto de TODOS los cables que entran/salen de la caja", async () => {
    // const r = await computeImpact({ kind: "box", id: mtHubId });
    // expect(r.fibers.length).toBeGreaterThan(0);
  });
});
