import { test, expect } from "@playwright/test";

/**
 * Flujo 1 (§17.3): registro → crear org → crear primera caja desde el mapa.
 * Skeleton — se completa cuando la infra local esté en CI (testcontainers).
 */
test.describe("Flujo 1 · crear caja desde mapa", () => {
  test.skip("login + abrir mapa + pin mode + crear caja", async ({ page }) => {
    await page.goto("http://app.fibraos.local:3000/login");
    await page.getByLabel("Email").fill("admin@demo.test");
    await page.getByLabel("Contraseña").fill("Demo1234!");
    await page.getByRole("button", { name: "Entrar" }).click();

    // Debería redirigir al tenant demo
    await expect(page).toHaveURL(/demo\.fibraos\.local/);

    await page.goto("http://demo.fibraos.local:3000/map");
    await page.getByRole("button", { name: /Añadir caja/ }).click();
    // Click aproximado en el centro del mapa
    await page.locator(".maplibregl-canvas").click({ position: { x: 400, y: 300 } });

    await expect(page).toHaveURL(/\/boxes\/new\?lat=/);
    await page.getByLabel("Código").fill("CTO-TEST-001");
    await page.getByLabel("Tipo").selectOption("cto");
    await page.getByRole("button", { name: /Crear caja/ }).click();

    await expect(page).toHaveURL(/\/boxes\/[0-9a-f-]+$/);
    await expect(page.getByRole("heading", { name: "CTO-TEST-001" })).toBeVisible();
  });
});
