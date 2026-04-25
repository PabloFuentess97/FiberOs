import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { sql } from "drizzle-orm";
import { startTestStack, type TestStack } from "./setup/containers";
import { seedImpactTopology, type MinimalSeed } from "./setup/seed-minimal";
import { computeImpact } from "@/lib/db/queries/impact";

/**
 * Flujo 5 completo contra Postgres+PostGIS real (ADR-005 + ADR-021).
 * Topología: OLT → splitter 1x8 → 8 CTOs → 8 clientes.
 */
describe("computeImpact (integration)", () => {
  let stack: TestStack;
  let seed: MinimalSeed;

  beforeAll(async () => {
    stack = await startTestStack();
    seed = await seedImpactTopology(stack);
  }, 120_000);

  afterAll(async () => {
    await stack?.stop();
  });

  async function withTenantContext<T>(fn: () => Promise<T>): Promise<T> {
    return stack.db.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.organization_id', ${seed.organizationId}, true)`);
      await tx.execute(sql`SELECT set_config('app.user_id', ${seed.userId}, true)`);
      return fn();
    });
  }

  it("cortar input-fiber del splitter → 8 clientes (broadcast)", async () => {
    const r = await withTenantContext(() =>
      computeImpact({ kind: "cable", id: seed.cableInputToSplId }),
    );
    expect(r.clients).toHaveLength(8);
    expect(new Set(r.clients.map((c) => c.id))).toEqual(new Set(seed.clientIds));
  });

  it("cortar un output-fiber individual → 1 cliente", async () => {
    const fiberId = seed.outputFiberIds[3]!;
    const r = await withTenantContext(() => computeImpact({ kind: "fiber", id: fiberId }));
    expect(r.clients).toHaveLength(1);
    expect(r.clients[0]?.id).toBe(seed.clientIds[3]);
  });

  it("cortar cable troncal sin fusiones al splitter → 0 clientes", async () => {
    // CBL-TRUNK tiene 96 fibras pero ninguna fusionada; no alcanza clientes
    const r = await withTenantContext(() =>
      computeImpact({ kind: "cable", id: seed.cableTrunkId }),
    );
    expect(r.clients).toHaveLength(0);
    expect(r.fibers.length).toBe(96); // todas las fibras del cable aparecen como "entrada" pero sin propagación
  });

  it("entrada box MT-HUB: alcanza los 8 clientes (cables entran+salen de la caja)", async () => {
    // Necesitamos el id de MT-HUB
    const boxes = await stack.client<{ id: string }[]>`
      SELECT id FROM boxes WHERE code = 'MT-HUB' AND organization_id = ${seed.organizationId}
    `;
    const mtHubId = boxes[0]!.id;
    const r = await withTenantContext(() => computeImpact({ kind: "box", id: mtHubId }));
    expect(r.clients.length).toBe(8);
  });
});
