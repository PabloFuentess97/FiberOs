# Sprint 5 — Resumen

- Fecha: 2026-04-23
- Objetivo (§23): app instalable offline-first.

## Entregado

### Modelo de datos
- `lib/db/schema/field.ts`:
  - `field_sync_queue` con `(device_id, client_uuid)` UNIQUE, índices por status + user.
  - `files` con metadata de blobs en object storage.
- Migración `0005_field.sql`: RLS en ambas, audit trigger en `files`.

### Dexie (IndexedDB local)
- `lib/field/db.ts`:
  - 8 colecciones: boxes, cables, fibers, splitters, splitterPorts, fusions, pendingMutations, meta.
  - Índices compuestos `[cableId+number]` y `[splitterId+kind+portNumber]` para joins eficientes.
  - Singleton lazy con guard SSR.
  - Helpers `getOrCreateDeviceId`, `countPending`, `enqueue`.

### Sync engine (cliente)
- `lib/field/sync.ts`:
  - `flushPending()` agrupa en batches de 50, marca `syncing`, reenvía y aplica resultados.
  - Ante fallo de red deja todo en `pending` e incrementa `attempts` sin reintento agresivo.
  - `retryConflict(uuid, forceNoVersion=true)` descarta versión local para forzar LWW puro.
  - `discardMutation(uuid)` borra de la cola.
- `lib/field/bootstrap.ts`:
  - Descarga snapshot del servidor y vuelca en Dexie dentro de transacción.
  - Acepta bbox opcional calculado desde GPS (5 km aprox. alrededor del técnico).

### Endpoints servidor
- `GET /api/field/bootstrap?bbox=` — devuelve cajas + cables + fibras + splitters + puertos dentro de la bbox (o toda la org).
- `POST /api/field/sync` — procesa batch de mutaciones con **LWW + detección de conflictos por `version`** + **idempotencia por `(device_id, client_uuid)`**:
  - Si ya existe fila con status `applied` → devuelve `noop`.
  - Si ya existe con status `rejected` → devuelve el error previo.
  - Si pending/conflict → re-procesa.
  - Re-valida `canFuse` en servidor antes de insertar.
  - Traduce errores de BD (`fusion_endpoints_fiber_unique`) a `already_fused`.
- `POST /api/field/upload-photo` — devuelve URL firmada S3 + crea fila en `files`.
- `GET /api/qr/[shortId]` — PNG 512×512 del QR codificado con URL canónica.
- `GET /t/[slug]/c/[shortId]` — redirect por User-Agent: móvil → `/field/boxes/{id}`, escritorio → `/boxes/{id}`. No requiere sesión; middleware se encarga del login-redirect si hace falta.

### Fotos
- `lib/field/photo.ts`:
  - `compressPhoto` con `browser-image-compression` a 1600×1600 WebP 0.85 en Web Worker.
  - `uploadCompressedPhoto` hace compress → firma URL → PUT directo a R2/MinIO.
- `lib/storage/s3.ts` factory de S3Client con `forcePathStyle` (MinIO/R2 compatible).

### PWA (Serwist)
- `app/sw.ts`: service worker con:
  - `CacheFirst` para tiles de MapTiler (máx 500 entradas, 30 días).
  - `NetworkFirst` con timeout 5s para `/api/field/bootstrap`.
  - `defaultCache` de Serwist para el resto (HTML, assets).
  - Fallback `/field/offline` para navegaciones document fallidas.
- `next.config.ts` envuelto en `withSerwist`:
  - SW solo activo en `NODE_ENV=production` (evita pelea con HMR).
  - Header `Service-Worker-Allowed: /` y `Cache-Control: must-revalidate`.
- `public/manifest.json` con nombre, theme_color, shortcuts (Escanear, Pendientes), iconos 192/512.
- `app/layout.tsx` referencia manifest + `apple-touch-icon` + `themeColor` via `viewport` export.

### UI campo (mobile-first)
- `components/field/FieldShell.tsx`:
  - Header compacto con indicador Online/Offline reactivo a `online`/`offline` events.
  - Contador de pendientes refrescado cada 2s desde Dexie.
  - Registro automático del SW en mount.
  - Nav inferior fija (Inicio, Escanear, Pendientes) con badge de conteo.
- Páginas:
  - `/field` — home con bootstrap + 2 tiles (escanear, pendientes) + hint de GPS.
  - `/field/scan` — cámara con `@yudiel/react-qr-scanner`, extracción `/c/{shortId}`, lookup local, navegación.
  - `/field/boxes/[id]` — datos de caja offline (desde Dexie), lista de cables/splitters/fusiones locales, FAB "Añadir fusión".
  - `/field/pending` — lista de mutaciones con status, botón "Sincronizar ahora", acciones por fila (forzar / descartar).
  - `/field/offline` — fallback estático.
- `components/field/QRScanner.tsx`: permiso proactivo de cámara, lock anti-doble-scan, mensajes en español.
- `components/field/FusionFormMobile.tsx`:
  - Selectores de endpoint A/B poblados desde Dexie (fibras + puertos), opciones ya fusionadas deshabilitadas.
  - `canFuse` local con warning naranja (misma-cable) y bloqueo rojo.
  - Input `capture=environment` para cámara directa.
  - Status inline: uploading → enqueuing → syncing → done.
  - Si offline al intentar subir foto: aviso, fusión se encola sin foto (no bloquea el registro).

### ADRs
- **ADR-006 · LWW + cola de conflictos** (version por entidad, idempotencia por client_uuid, excepción fusiones via UNIQUE).
- **ADR-019 · Compresión client-side de fotos** (WebP 1600px, Web Worker, ~10× menos tráfico 4G).

### Tests
- `tests/e2e/pwa-field.spec.ts`: skeleton flujo 4 con `context.setOffline(true/false)`. Requiere build prod + seed; se activa en Sprint 8 con testcontainers.

## Decisiones tomadas fuera del blueprint

1. **Excepción a LWW para fusiones**: no uso `version` en `fusions` para sync porque el UNIQUE parcial de `fusion_endpoints` ya garantiza no-duplicado. Si dos técnicos intentan fusionar el mismo extremo, el segundo recibe `already_fused` en lugar de un conflicto versionado. Documentado en ADR-006.
2. **`noop` como status propio** cuando el servidor detecta `(device_id, client_uuid)` ya aplicado: diferente de `applied` para que el cliente sepa "no hice nada esta vez, estaba ya hecho". Evita contadores falsos en UI.
3. **Foto opcional si offline en el momento del upload**. Blueprint §14.5 dice "compresión client-side + upload", pero no cubre qué pasa si no hay red al subir. Opté por encolar la fusión sin foto + avisar al técnico, mejor que bloquear el registro.
4. **SW solo en producción**: en dev Next HMR es incompatible con caching agresivo. La PWA se prueba con `pnpm build && pnpm start` o en staging.
5. **Iconos PWA placeholder**: el logo final llega cuando el cliente lo entregue (§28). El manifest es válido pero los iconos son imágenes de relleno; no bloquea la instalabilidad.

## Bloqueadores / dependencias externas

- **MinIO en docker-compose dev** necesario para probar subida de fotos. Ya existe en §19.1 del blueprint y está en el `docker-compose.yml` local.
- **Icono de marca** real para reemplazar los placeholders (§28).
- **HTTPS en dev** para usar cámara: iOS bloquea `getUserMedia` en HTTP salvo `localhost`. Para probar en móvil real desde la LAN hay que servir vía `caddy-dev` con mkcert (documentado en §31.7).

## Definition of Done

- [x] Schema + migración aplicables.
- [x] Dexie inicializa con 8 colecciones, singleton safe con SSR.
- [x] Bootstrap descarga snapshot bbox o completo; se persiste en Dexie.
- [x] QR scanner lee `/c/{shortId}` y navega a detalle offline.
- [x] Formulario de fusión móvil funciona con endpoints locales, valida `canFuse`, encola mutación con `client_uuid`.
- [x] Sync endpoint aplica LWW, detecta conflictos por `version`, es idempotente por `(device_id, client_uuid)`.
- [x] Pantalla "Mis cambios pendientes" muestra status y permite forzar/descartar.
- [x] Al recuperar red, auto-flush en el shell + en pending page.
- [x] Fotos se comprimen client-side a WebP 1600px antes de firmar URL.
- [x] Manifest válido + SW instalable en build de producción.
- [x] ADR-006 y ADR-019 escritas.

## Siguientes pasos (Sprint 6)

1. `lib/importer/*` con parser Excel (`exceljs` streams), mapping flexible, transforms, dry-run.
2. BullMQ worker `import-runner` + UI polling `/api/jobs/[id]`.
3. UI `/import` con 4 pasos (upload → mapeo → dry-run → ejecutar).
4. Plantillas preset TMDigital (boxes, cables, clients).
5. Exportador `/api/export/xlsx`.
6. QR endpoint + PDF labels con `@react-pdf/renderer`.
7. Fixture `tests/fixtures/tmdigital-sample.xlsx`.
8. ADR-007 (worker deployment), ADR-015 (PDFs react-pdf).
