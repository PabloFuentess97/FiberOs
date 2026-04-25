# ADR-012: `next-intl` preparado para multi-idioma (MVP solo `es`)

- Status: accepted
- Date: 2026-04-24
- Sprint: 0

## Contexto

El MVP tiene un solo idioma (español), pero el cliente piloto (TMDigital)
opera en la Península y podría querer portugués en corto. Otros prospects
latinoamericanos hablan español de LATAM; y el producto podría exportarse
a inglés para investigadores / integradores.

## Decisión

Integrar `next-intl` desde Sprint 0 con un único diccionario `messages/es.json`.
La matriz para `pt` / `en` queda preparada; solo falta el archivo de
traducción. **No** renderizamos el switcher de idioma aún (ruido).

- `NextIntlClientProvider` envuelve el layout tenant.
- Llaves jerárquicas: `boxes.list.title`, `boxes.form.errors.code_unique`.
- Fechas con `date-fns` + locale `es`.
- Números con `Intl.NumberFormat('es-ES')`.

## Consecuencias

- **Pros**:
  - Un solo punto de verdad para strings visibles al usuario.
  - Añadir `pt.json` es 1 PR cuando haga falta.
  - El linter de `next-intl` detecta llaves faltantes.

- **Cons**:
  - Pequeño overhead de runtime (~15 kB gzip) por el provider. Aceptable.
  - Curva inicial al hardcodear strings en el código: debe ir por
    `t('...')`. Pre-commit hook podría detectarlo en futuro.

## Alternativas

| Alternativa | Por qué descartada |
|---|---|
| `i18next` | Más dependencias, API menos orientada a Next RSC. |
| Solo hardcodear es-ES | Refactor costoso cuando llegue el 2º idioma. |
| Google Translate API en runtime | Calidad inaceptable para UI técnica de FTTH. |
