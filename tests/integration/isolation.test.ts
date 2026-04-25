import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { sql, eq, and } from "drizzle-orm";
import { startTestStack, type TestStack } from "./setup/containers";
import { boxes } from "@/lib/db/schema/network";

/**
 * Flujo 6 completo: aislamiento multi-tenant con RLS real.
 * Crea 2 orgs, una caja en cada, verifica:
 *   - Con app.organization_id = A solo se ve la caja de A.
 *   - SELECT sin filtro tampoco cruza (RLS aplica a todas las operaciones).
 *   - INSERT intentando cambiar organization_id falla con RLS WITH CHECK.
 */
describe("Tenant isolation (RLS)", () => {
  let stack: TestStack;
  let orgA: string;
  let orgB: string;
  let userA: string;
  let userB: string;
  let boxA: string;
  let boxB: string;

  beforeAll(async () => {
    stack = await startTestStack();

    // Org A + usuario
    const [oA] = await stack.client<{ id: string }[]>`
      INSERT INTO organizations (name, slug, country) VALUES ('Org A', 'org-a', 'ES') RETURNING id
    `;
    orgA = oA!.id;
    const [uA] = await stack.client<{ id: string }[]>`
      INSERT INTO users (email, email_verified_at) VALUES ('a@test.local', now()) RETURNING id
    `;
    userA = uA!.id;
    await stack.client`
      INSERT INTO organization_members (organization_id, user_id, role)
      VALUES (${orgA}, ${userA}, 'admin')
    `;

    // Org B
    const [oB] = await stack.client<{ id: string }[]>`
      INSERT INTO organizations (name, slug, country) VALUES ('Org B', 'org-b', 'ES') RETURNING id
    `;
    orgB = oB!.id;
    const [uB] = await stack.client<{ id: string }[]>`
      INSERT INTO users (email, email_verified_at) VALUES ('b@test.local', now()) RETURNING id
    `;
    userB = uB!.id;
    await stack.client`
      INSERT INTO organization_members (organization_id, user_id, role)
      VALUES (${orgB}, ${userB}, 'admin')
    `;

    // Caja en cada org (con sesión local)
    await stack.client`SELECT set_config('app.organization_id', ${orgA}, false)`;
    await stack.client`SELECT set_config('app.user_id', ${userA}, false)`;
    const [bA] = await stack.client<{ id: string }[]>`
      INSERT INTO boxes (organization_id, code, short_id, type, location, created_by, updated_by)
      VALUES (${orgA}, 'A-001', '', 'cto',
        ST_GeographyFromText('SRID=4326;POINT(-3.6 37.17)'),
        ${userA}, ${userA})
      RETURNING id
    `;
    boxA = bA!.id;

    await stack.client`SELECT set_config('app.organization_id', ${orgB}, false)`;
    await stack.client`SELECT set_config('app.user_id', ${userB}, false)`;
    const [bB] = await stack.client<{ id: string }[]>`
      INSERT INTO boxes (organization_id, code, short_id, type, location, created_by, updated_by)
      VALUES (${orgB}, 'B-001', '', 'cto',
        ST_GeographyFromText('SRID=4326;POINT(-3.6 37.18)'),
        ${userB}, ${userB})
      RETURNING id
    `;
    boxB = bB!.id;
  }, 120_000);

  afterAll(async () => {
    await stack?.stop();
  });

  it("sesión de Org A solo ve cajas de Org A", async () => {
    const rows = await stack.db.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.organization_id', ${orgA}, true)`);
      return tx.select({ id: boxes.id, code: boxes.code }).from(boxes);
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.code).toBe("A-001");
    expect(rows[0]?.id).toBe(boxA);
  });

  it("sesión de Org B solo ve cajas de Org B", async () => {
    const rows = await stack.db.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.organization_id', ${orgB}, true)`);
      return tx.select({ id: boxes.id, code: boxes.code }).from(boxes);
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.code).toBe("B-001");
    expect(rows[0]?.id).toBe(boxB);
  });

  it("intentar acceder a caja de Org B por id directo desde sesión A devuelve vacío", async () => {
    const rows = await stack.db.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.organization_id', ${orgA}, true)`);
      return tx.select().from(boxes).where(eq(boxes.id, boxB));
    });
    expect(rows).toHaveLength(0);
  });

  it("INSERT con organization_id ajeno es rechazado por WITH CHECK", async () => {
    await expect(
      stack.db.transaction(async (tx) => {
        await tx.execute(sql`SELECT set_config('app.organization_id', ${orgA}, true)`);
        await tx.execute(sql`SELECT set_config('app.user_id', ${userA}, true)`);
        await tx.execute(sql`
          INSERT INTO boxes (organization_id, code, short_id, type, location, created_by, updated_by)
          VALUES (${orgB}, 'SNEAKY', '', 'cto',
            ST_GeographyFromText('SRID=4326;POINT(-3.6 37.18)'),
            ${userA}, ${userA})
        `);
      }),
    ).rejects.toThrow();
  });

  it("UPDATE de caja ajena desde sesión A no modifica nada (0 filas)", async () => {
    const updated = await stack.db.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.organization_id', ${orgA}, true)`);
      return tx
        .update(boxes)
        .set({ notes: "hacked" })
        .where(and(eq(boxes.id, boxB)))
        .returning({ id: boxes.id });
    });
    expect(updated).toHaveLength(0);
  });
});
