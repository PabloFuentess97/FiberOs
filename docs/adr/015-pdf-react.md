# ADR-015: PDFs con `@react-pdf/renderer`

- Status: accepted
- Date: 2026-04-24
- Sprint: 6

## Contexto

FibraOS genera PDFs para:

1. Etiquetas de caja con QR (impresión térmica individual y A4 × 8/página).
2. Reportes futuros (informes de impacto, resumen de red). Fuera del MVP
   pero el render engine debe soportarlo sin cambiar de librería.

Los PDFs se generan **en el servidor** (Route Handler Node runtime) para
poder embedir fuentes, imágenes binarias y aplicar branding del tenant.
Opciones evaluadas: `pdfkit`, `puppeteer`, `@react-pdf/renderer`.

## Decisión

**`@react-pdf/renderer` v4.**

- API JSX-first: el mismo modelo mental que el resto de UI.
- Renderiza a Buffer sin dependencias nativas pesadas (no Chromium, no libc).
- Soporta `<Image>` con data URLs (embed del QR PNG sin archivos temporales).
- Soporte razonable de fuentes (Helvetica nativo; custom fonts registrables).
- `renderToBuffer()` corre en Node runtime — compatible con Hetzner sin
  sidecars ni binarios extras.
- Mantenido (última versión 4.1.5 en 2025).

## Consecuencias

- **Pros:**
  - Componibilidad: `LabelsDocument({ boxes, branding, format })` se compone
    como cualquier componente React. Testable con snapshots.
  - Sin navegador headless → imagen Docker final ~200 MB menos que con
    Puppeteer/Playwright.
  - Branding por tenant (logo, color) se pasa como prop.
  - Sincronico: latencia <300 ms para un A4 de 8 labels con QR embebidos en
    un CPX21 de Hetzner.

- **Cons / trade-offs:**
  - Layout flex-only (no grid CSS completo). Para labels y reportes
    tabulares es suficiente; si algún día queremos un PDF con columnas CSS
    complejas, migrar a Puppeteer.
  - Soporte de fuentes custom requiere `Font.register` — no soporta
    variable fonts al 100%.
  - El binario del QR se pasa como data URL (base64); añade ~30% de tamaño
    respecto a asset binario, negligible.

## Alternativas consideradas

| Alternativa | Por qué descartada |
|---|---|
| Puppeteer / Playwright (HTML→PDF) | Chromium en imagen Docker añade ~500 MB y una superficie de ataque grande; latencia 2-4s por render. |
| pdfkit directamente | API imperativa, difícil de componer con branding dinámico. |
| jsPDF (client-side) | No podemos firmar con la fuente de verdad (branding en servidor); además perdemos SSR. |
| Weasyprint / wkhtmltopdf | Dependencias nativas problemáticas en Alpine. |
| Servicio externo (DocRaptor, PDFMonkey) | Coste + dependencia; innecesario para labels simples. |
