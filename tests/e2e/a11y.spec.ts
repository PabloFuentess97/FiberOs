import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * Auditoría WCAG AA con axe-core automático (§23 Sprint 8).
 * Chequea las páginas críticas del dashboard y del field PWA.
 * Skeleton — se activa cuando el seed esté disponible en CI.
 */
const PAGES = [
  "/",
  "/boxes",
  "/cables",
  "/clients",
  "/map",
  "/import",
  "/search",
  "/settings/domains",
  "/settings/branding",
  "/settings/billing",
];

test.describe("Accesibilidad WCAG AA", () => {
  for (const path of PAGES) {
    test.skip(`sin violaciones críticas en ${path}`, async ({ page }) => {
      await page.goto(`http://demo.fibraos.local:3000${path}`);
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "best-practice"])
        .disableRules(["color-contrast"]) // custom brand colors requieren override
        .analyze();
      const critical = results.violations.filter(
        (v) => v.impact === "serious" || v.impact === "critical",
      );
      expect(critical, JSON.stringify(critical, null, 2)).toEqual([]);
    });
  }
});
