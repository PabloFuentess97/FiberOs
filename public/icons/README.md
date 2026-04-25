# Iconos PWA

Este directorio debe contener:

- `icon-192.png` (192x192, maskable)
- `icon-512.png` (512x512, maskable)
- `apple-touch-icon.png` (180x180)
- `favicon.ico` (multi-size)

Generación recomendada desde un SVG de marca (logo FibraOS):

```bash
# Con pwa-asset-generator (https://github.com/elegantapp/pwa-asset-generator)
npx pwa-asset-generator brand.svg public/icons \
  --manifest public/manifest.json \
  --favicon \
  --padding "15%" \
  --background "#0B1220"
```

En el MVP usamos placeholders hasta que el cliente entregue el logo final
(bloqueador Sprint 2 §28). Mientras tanto, cualquier imagen 192/512 PNG
cumple con el manifest y permite instalar la PWA.
