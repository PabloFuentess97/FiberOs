import { requireTenantContext } from "@/lib/tenancy/guards";
import { withTenantTx } from "@/lib/tenancy/context";
import { listBoxesForMap } from "@/lib/db/queries/boxes";
import { CableDrawClient } from "@/components/map/CableDrawClient";

export default async function DrawCablePage() {
  const ctx = await requireTenantContext();
  if (!ctx) return null;

  const boxes = await withTenantTx(
    { userId: ctx.userId, organizationId: ctx.organizationId, impersonatedBy: ctx.impersonatedBy },
    async () => listBoxesForMap(ctx.organizationId),
  );

  const center: [number, number] =
    boxes.length > 0 && boxes[0] ? [boxes[0].lng, boxes[0].lat] : [-3.5986, 37.1773];

  const mapKey = process.env.MAPTILER_API_KEY ?? "";
  const styleUrl = mapKey
    ? `https://api.maptiler.com/maps/streets-v2/style.json?key=${mapKey}`
    : "https://demotiles.maplibre.org/style.json";

  return <CableDrawClient styleUrl={styleUrl} center={center} />;
}
