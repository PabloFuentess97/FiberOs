import { requireTenantContext } from "@/lib/tenancy/guards";
import { withTenantTx } from "@/lib/tenancy/context";
import { listBoxesForMap } from "@/lib/db/queries/boxes";
import { listCablesForMap } from "@/lib/db/queries/cables";
import { MapClient } from "@/components/map/MapClient";

export default async function MapPage() {
  const ctx = await requireTenantContext();
  if (!ctx) return null;

  const [boxes, cables] = await withTenantTx(
    { userId: ctx.userId, organizationId: ctx.organizationId, impersonatedBy: ctx.impersonatedBy },
    async () =>
      Promise.all([listBoxesForMap(ctx.organizationId), listCablesForMap(ctx.organizationId)]),
  );

  const cableFeatures = cables
    .filter((c) => c.pathGeoJson)
    .map((c) => ({
      type: "Feature" as const,
      id: c.id,
      properties: { code: c.code, cableType: c.type },
      geometry: JSON.parse(c.pathGeoJson!),
    }));

  const boxFeatures = boxes.map((b) => ({
    type: "Feature" as const,
    id: b.id,
    properties: {
      code: b.code,
      boxType: b.type,
      status: b.status,
      address: b.address ?? "",
    },
    geometry: { type: "Point" as const, coordinates: [b.lng, b.lat] },
  }));

  // Granada centro por defecto si no hay cajas
  const center: [number, number] =
    boxes.length > 0 && boxes[0]
      ? [boxes[0].lng, boxes[0].lat]
      : [-3.5986, 37.1773];

  const mapKey = process.env.MAPTILER_API_KEY ?? "";
  const styleUrl = mapKey
    ? `https://api.maptiler.com/maps/streets-v2/style.json?key=${mapKey}`
    : "https://demotiles.maplibre.org/style.json"; // fallback sin key

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col">
      <MapClient
        styleUrl={styleUrl}
        center={center}
        zoom={14}
        boxFeatures={boxFeatures}
        cableFeatures={cableFeatures}
        hasMapTilerKey={!!mapKey}
      />
    </div>
  );
}
