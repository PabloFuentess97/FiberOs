import { test, expect } from "@playwright/test";

/**
 * Flujo 3 (§17.3): diagrama interior y fusiones.
 * Precondición: `pnpm seed` ya creó 2 splitters 1x8 y 18 fusiones en MT-ALBAICIN-01.
 * Skeleton — habilitar cuando haya testcontainers en CI.
 */
test.describe("Flujo 3 · diagrama interior", () => {
  test.skip("abrir diagrama, cambiar a modo editar, crear fusión manual", async ({ page }) => {
    await page.goto("http://app.fibraos.local:3000/login");
    await page.getByLabel("Email").fill("admin@demo.test");
    await page.getByLabel("Contraseña").fill("Demo1234!");
    await page.getByRole("button", { name: "Entrar" }).click();

    await page.goto("http://demo.fibraos.local:3000/boxes");
    await page.getByRole("cell", { name: "MT-ALBAICIN-01" }).click();
    await page.getByRole("link", { name: /Abrir diagrama/ }).click();

    await expect(page.getByRole("heading", { name: /Interior de MT-ALBAICIN/ })).toBeVisible();

    // Modo editar por defecto para admin
    await expect(page.getByRole("button", { name: /Editar/ })).toHaveClass(/primary/);

    // TODO: simular drag entre dos handles es frágil en Playwright con React Flow.
    // Se validará con un test de integración que invoque directamente `createFusionAction`.
  });
});
