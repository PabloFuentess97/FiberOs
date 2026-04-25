import { test, expect } from "@playwright/test";

/**
 * Flujo 5 (§17.3): trazado de impacto end-to-end.
 * Precondición: `pnpm seed` ha creado topología + fusiones + clientes.
 * Skeleton hasta testcontainers.
 */
test.describe("Flujo 5 · trazado de impacto", () => {
  test.skip("cortar CBL-MT-ALB muestra clientes afectados en Albaicín", async ({ page }) => {
    await page.goto("http://app.fibraos.local:3000/login");
    await page.getByLabel("Email").fill("admin@demo.test");
    await page.getByLabel("Contraseña").fill("Demo1234!");
    await page.getByRole("button", { name: "Entrar" }).click();

    await page.goto("http://demo.fibraos.local:3000/cables");
    await page.getByRole("cell", { name: "CBL-MT-ALB" }).click();

    // El detalle tiene un link "Trazar impacto" (pendiente de implementar como botón dedicado)
    await page.goto(
      "http://demo.fibraos.local:3000/search?kind=cable&id=" + (await findCableIdFromDOM(page)),
    );

    await expect(page.getByRole("heading", { name: "Trazado de impacto" })).toBeVisible();
    // Después del seed deberíamos ver ~16 clientes en Albaicín (2 subtroncales × 8 CTOs × 1 cliente/CTO = 16)
    await expect(page.getByText(/clientes impactados/)).toBeVisible();
  });

  test.skip("cmd+K devuelve resultados por nombre", async ({ page }) => {
    await page.goto("http://demo.fibraos.local:3000/");
    await page.keyboard.press("Meta+k");
    await page.getByPlaceholder(/Busca cajas/).fill("Carmen");
    await expect(page.getByText("Carmen")).toBeVisible();
  });
});

// Helper (placeholder): en la implementación real extraeríamos el UUID del atributo data-cable-id
async function findCableIdFromDOM(_page: unknown): Promise<string> {
  return "00000000-0000-0000-0000-000000000000";
}
