import { test, expect } from "@playwright/test";

/**
 * Flujo 4 (§17.3): PWA offline end-to-end.
 * Skeleton — requiere Serwist activo (build prod) y seed con cajas.
 *
 * El plan:
 *   1. Login + bootstrap → Dexie con 16 cajas.
 *   2. context.setOffline(true).
 *   3. Navegar a /field/boxes/{id} (viene de QR escaneado simulado por URL).
 *   4. Crear fusión + foto.
 *   5. context.setOffline(false) → esperar sync + 0 conflictos.
 */
test.describe("Flujo 4 · PWA offline-first", () => {
  test.skip("crear fusión offline y sincronizar al volver online", async ({ browser }) => {
    const ctx = await browser.newContext({
      permissions: ["geolocation", "camera"],
      geolocation: { latitude: 37.1773, longitude: -3.5986 }, // Granada
    });
    const page = await ctx.newPage();

    await page.goto("http://app.fibraos.local:3000/login");
    await page.getByLabel("Email").fill("tech@demo.test");
    await page.getByLabel("Contraseña").fill("Demo1234!");
    await page.getByRole("button", { name: "Entrar" }).click();

    await page.goto("http://demo.fibraos.local:3000/field");
    await page.getByRole("button", { name: /Descargar cercanos/ }).click();
    await expect(page.getByText(/cajas descargadas/)).toBeVisible();

    // Simular QR escaneado navegando a /c/{shortId}
    // En realidad el QR lee shortId del seed; aquí usamos uno conocido.
    await page.goto("http://demo.fibraos.local:3000/c/DEMOSHORT");

    await ctx.setOffline(true);
    await page.getByRole("button", { name: /Añadir fusión/ }).click();
    // ...selección de endpoints + guardar...

    await ctx.setOffline(false);
    await page.goto("http://demo.fibraos.local:3000/field/pending");
    await expect(page.getByText(/Aplicadas: 1/)).toBeVisible({ timeout: 10_000 });
  });
});
