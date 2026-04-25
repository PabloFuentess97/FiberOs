# ADR-019: Compresión client-side de fotos PWA

- Status: accepted
- Date: 2026-04-23
- Sprint: 5

## Contexto

Los técnicos hacen fotos de cada fusión desde el móvil. Una cámara típica
produce JPEG de 3-5 MB por foto. Con 4G en pueblo o en arqueta subterránea,
subir ese peso es lento y caro. Adicionalmente R2 cobra por PUT y ancho de
banda egreso (aunque gratis en R2, sí en alternativas como Hetzner Object
Storage). Hay dos puntos de compresión: cliente o servidor.

## Decisión

**Comprimir client-side antes de solicitar la URL firmada**, con
`browser-image-compression`:

- `maxWidthOrHeight = 1600` píxeles.
- `fileType = "image/webp"`.
- `initialQuality = 0.85`.
- `useWebWorker = true` para no bloquear el hilo de UI.
- Una foto de 12 MP (~4 MB JPEG) se reduce a 250-400 KB WebP sin pérdida
  visible de detalle relevante (empalmes de fibra).

Flujo (`lib/field/photo.ts`):

1. `compressPhoto(file)` → WebP 1600×1600.
2. `POST /api/field/upload-photo` con `mime`, `sizeBytes`, `width`, `height`
   + `relatedTable/relatedId` opcional.
3. Servidor crea fila en `files` y responde con `uploadUrl` firmada (15 min).
4. `PUT uploadUrl` con el blob comprimido directo a R2/MinIO.
5. El `fileId` se guarda como `photoFileId` en la mutación de fusión.

Si no hay conexión al intentar subir, la fusión se encola **sin foto**. El
técnico recibe un aviso y puede subir la foto después desde el dashboard.
Alternativa futura: cola de uploads diferidos en Dexie.

## Consecuencias

- **Pros:**
  - ~10× menos tráfico 4G → sync 10× más rápido.
  - WebP es soportado por todos los navegadores modernos; pesa 25-35% menos
    que JPEG a calidad equivalente.
  - Web Workers mantienen UI responsive durante la compresión (típicamente
    <2s en móviles 2020+).
  - Dimensiones (`width`, `height`) se guardan en BD → UI puede generar
    srcset sin recomprimir.

- **Cons / trade-offs:**
  - Pierde resolución para zoom forense (> 1600px). Para fusión de fibra no
    es útil — los defectos se ven mucho antes. Si algún cliente lo pide,
    ajustamos `maxWidthOrHeight` por plan.
  - Móviles muy antiguos (pre-2019 gama baja) pueden tardar 5-10s en
    comprimir; aún así mejor que subir 4 MB por 4G.
  - Si el técnico cancela la app durante la compresión, el blob se pierde
    (no persiste en Dexie). Aceptable para MVP.

## Alternativas consideradas

| Alternativa | Por qué descartada |
|---|---|
| Subir original y comprimir server-side con `sharp` | Duplica coste de bandwidth; no ahorra nada en la subida. |
| Cliente sube original, lambda/function comprime en background | Añade infra; no hay versión nativa en Hetzner Docker Compose. |
| Solo redimensionar sin WebP | Pierde 25-35% de compresión adicional. |
| `ImageCapture` API nativa con resolución limitada | Soporte de browser irregular; `<input type=file accept=image/* capture>` es más robusto. |
| Dejar subida diferida en Dexie desde el día 1 | Añade superficie de bugs al MVP. Se implementará si los técnicos reportan pérdida de fotos. |
