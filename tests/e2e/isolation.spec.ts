import { test, expect } from "@playwright/test";

/**
 * Flujo 6 del blueprint (§17.3): aislamiento multi-tenant.
 * Skeleton — requiere infra levantada + seed con 2 orgs + 2 usuarios.
 * Implementación completa bloqueada hasta que `pnpm seed` cree una 2ª org (Sprint 4).
 */
test.describe("Aislamiento multi-tenant", () => {
  test.skip("usuario de org A no ve cajas de org B", async ({ browser }) => {
    const ctxA = await browser.newContext();
    const ctxB = await browser.newContext();
    const pageA = await ctxA.newPage();
    const pageB = await ctxB.newPage();

    await pageA.goto("http://demo.fibraos.local:3000/boxes");
    // TODO (Sprint 4): crear orgB en seed + autenticar usuarios
    await pageB.goto("http://orgb.fibraos.local:3000/boxes");

    const codesA = await pageA.getByRole("cell", { name: /CTO-/ }).allTextContents();
    const codesB = await pageB.getByRole("cell", { name: /CTO-/ }).allTextContents();
    expect(codesA).not.toEqual(codesB);
  });
});
