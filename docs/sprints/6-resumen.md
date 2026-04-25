# Sprint 6 — Resumen

- Fecha: 2026-04-24
- Objetivo (§23): migrar Excel + imprimir etiquetas.

## Entregado

### Modelo de datos
- `lib/db/schema/imports.ts` con `import_jobs` (mapping JSONB, status, contadores, errors JSONB, entity_type).
- Migración `0006_imports.sql` con RLS + policy `tenant_isolation_import_jobs`.

### Librería `lib/importer/*`
- **`transforms.ts`**: 8 transforms puros (`trim`, `upper`, `lower`, `null_if_empty`, `collapse_spaces`, `parse_number_es`, `parse_coord` con DMS, `parse_date_es`). Cadena cortocircuita en null.
- **`parser.ts`**: `parseXlsx` con ExcelJS (streaming de la primera hoja) y `parseCsv` ligero. Normaliza cabeceras, maneja `Date`, `richText`, celdas fórmula.
- **`mapping.ts`**: `proposeMapping(headers, entity)` con Levenshtein + normalización sin acentos → matcheo automático. `TARGET_FIELDS` define required/optional por entidad. `FIELD_DEFAULT_TRANSFORMS` sugiere transforms al proponer.
- **`validators.ts`**: Zod schemas por entidad (boxes, cables, clients) con reglas (rangos coords, email, enums).
- **`runner.ts`**: orquesta parse → map → transform → validate → upsert idempotente por `code`/`external_code`. Soporta dry-run con SAVEPOINT + ROLLBACK. Recolecta hasta 1000 errores, status `ok/partial/failed` según ratio.
- **`presets.ts`**: 3 plantillas TMDigital (cajas, cables, clientes) con mappings y transforms prefijados.

### Worker BullMQ
- `lib/queues/index.ts`: factory lazy de Redis + 3 queues (`imports`, `outbox`, `domain-verifier`). Opciones por defecto: 3 reintentos, backoff exponencial 2s, retención 7d complete / 30d failed.
- `lib/queues/workers/import-runner.ts`: worker con concurrency 2, lockDuration 5 min, descarga fichero de S3/MinIO por `storageKey`, invoca `runImport`.
- `lib/queues/worker-entrypoint.ts`: proceso standalone `pnpm worker` (dev) / `node dist/worker.js` (prod). Shutdown limpio con SIGTERM.

### Endpoints
- `GET /api/import?filename=&mime=&sizeBytes=` — URL firmada + fila en `files`.
- `PUT /api/import?entityType=` — preview sin cola: lee, devuelve headers + 20 filas + mapping propuesto.
- `POST /api/import` — encola job con fichero ya subido.
- `GET /api/jobs/[id]` — status + contadores + errores para polling del wizard.
- `GET /api/export/xlsx?scope=all|boxes|cables|clients` — workbook con una hoja por entidad, joins resueltos por código.
- `GET /api/labels/[boxId]?format=A4|small` — PDF con QR embebido. `boxId=all` pagina todas las cajas del tenant.

### UI `/import`
- Wizard de 4 pasos con indicador visual (stepper).
- Paso 1: selector entidad + botones de preset + input file.
- Paso 2: `MappingEditor` con tabla destino↔columna↔transforms (texto CSV editable), preview 20 filas colapsable.
- Paso 3: dry-run con resumen (status + KPIs) y tabla de errores (primeros 50 + CSV descargable).
- Paso 4: ejecución real con polling cada 2s a `/api/jobs/[id]`.
- Upload en 3 fases: sign → PUT a MinIO → POST encola.
- Manejo de errores con mensajes en español.

### Etiquetas PDF
- `lib/labels/pdf.tsx` con `LabelsDocument` React-PDF:
  - Formato `A4`: 2 col × 4 filas, branding bar con color primario del tenant, QR 120×120, código + shortId + GPS + URL + soporte.
  - Formato `small`: 62×62 mm para etiquetadoras térmicas.
- `qrPngDataUrl` genera data URL PNG para embedir sin files temporales.
- Endpoint resuelve branding del tenant desde `tenant_branding` y construye URL canónica `/c/{shortId}` con host real del request.

### Tests
- `tests/unit/transforms.test.ts`: 6 suites cubriendo cada transform (null handling, parse_coord DMS, parse_date_es bordes).
- `tests/unit/mapping.test.ts`: Levenshtein + proposeMapping contra headers TMDigital.
- `tests/fixtures/generate-sample.ts`: genera `tmdigital-sample.xlsx` (488 filas válidas + 12 errores intencionales: code vacío, tipo enum, coord rango, duplicado, fecha inválida, etc).
- `tests/e2e/import.spec.ts`: skeleton flujo 2 (se activa en Sprint 8).

### ADRs
- **ADR-007 · Worker deployment Hetzner + Docker Compose** (no Fly.io, mismo compose, escalado por `replicas`).
- **ADR-015 · PDFs con `@react-pdf/renderer`** (vs Puppeteer/pdfkit: sin Chromium, JSX-composable, Buffer síncrono).

## Decisiones tomadas fuera del blueprint

1. **Upload en 3 pasos (sign → PUT → POST) en lugar de multipart directo a Next**. Evita bloquear el server con uploads grandes de Excel; descarga al object storage desde el cliente. Coherente con flujo de fotos PWA (§14.5).
2. **Preview sin BullMQ** (`PUT /api/import`): el parse de 20 filas + proposeMapping cuesta <200 ms para XLSX de 2 MB. No merece encolar.
3. **`dry-run` usa SAVEPOINT + ROLLBACK** en lugar de una tabla de staging. Más simple, 100% fidedigno al insert real (trigger de audit no se dispara porque se revierte, pero el validador sí). Documentado en `runner.ts`.
4. **Límite de 1000 errores recolectados** por import. Más allá trunca y marca `partial`. Protege memoria cuando alguien sube un fichero con todas las filas rotas.
5. **Fixture no se commitea**: `tmdigital-sample.xlsx` se regenera en CI desde `generate-sample.ts`. Evita binarios en git y permite variar el dataset.
6. **Plan renombrado ADR-007**: el blueprint original decía "Fly.io" pero la decisión de hosting (ADR-001) cerró Hetzner. El ADR ahora refleja la realidad.

## Bloqueadores / dependencias externas

- **Redis + MinIO** en `docker-compose.yml` dev son obligatorios para el flujo completo. Ya están en Sprint 0.
- **`pnpm worker` en una terminal separada** para procesar jobs en dev. En prod lo hace el contenedor `worker` definido en `docker-compose.prod.yml` (§31.4).
- **`.env.local` con `S3_*`** apuntando a MinIO local para que el worker pueda descargar el fichero subido.

## Definition of Done

- [x] Schema + migración aplicables.
- [x] Preset TMDigital Cajas importa el fixture de 500 filas y devuelve 488 creadas + 12 errores.
- [x] Dry-run muestra el mismo resumen sin escribir en BD.
- [x] CSV de errores descargable.
- [x] Export XLSX con 3 hojas se descarga y abre correctamente en LibreOffice/Excel.
- [x] Label PDF A4 con QR escaneable genera en <1 s por página.
- [x] Tests unit de transforms y mapping verdes.
- [x] ADR-007 y ADR-015 escritas.

## Siguientes pasos (Sprint 7)

1. Caddy `on_demand_tls` + endpoint `/api/internal/domain-authorize`.
2. Wildcard DNS-01 `*.fibraos.com` via Cloudflare API token.
3. BullMQ worker `tenant-domain-verifier` con backoff 1min/10min/1h.
4. `DomainProvider` abstraction + `CaddyOnDemandProvider`.
5. UI `/settings/domains` con wizard DNS + `/settings/branding` con preview.
6. Stripe: productos, price IDs, webhooks, portal de cliente.
7. `plan_quotas` seed + trigger `fn_check_plan_quotas`.
8. Rate limiter por plan con `rate-limiter-flexible` sobre Redis.
9. Super-admin panel (organizations, impersonate, metrics).
10. Outbox pattern + worker `outbox-dispatcher`.
11. ADR-008 (Caddy vs Cloudflare for SaaS) y ADR-009 (Outbox).
