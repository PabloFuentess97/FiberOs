import { test, expect } from "@playwright/test";

/**
 * Flujo 2 (§17.3): importar Excel.
 * Skeleton — requiere fixture generada + worker BullMQ levantado.
 * Se activa en Sprint 8 con testcontainers (Postgres + Redis).
 */
test.describe("Flujo 2 · import Excel", () => {
  test.skip("importa 500 filas con 12 errores intencionales", async ({ page }) => {
    await page.goto("http://demo.fibraos.local:3000/import");
    await page.getByLabel("Tipo de entidad").selectOption("boxes");
    const fileInput = page.locator("input[type=file]");
    await fileInput.setInputFiles("tests/fixtures/tmdigital-sample.xlsx");
    await expect(page.getByText(/500 filas detectadas/)).toBeVisible();

    // Paso 2: aceptar mapping propuesto
    await page.getByRole("button", { name: /Validar/ }).click();
    // Espera dry-run
    await expect(page.getByText(/partial|ok/)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/12 errores/)).toBeVisible();

    // Paso 4: ejecutar real
    await page.getByRole("button", { name: /Ejecutar import real/ }).click();
    await expect(page.getByText(/488 creadas/)).toBeVisible({ timeout: 30_000 });
  });
});
