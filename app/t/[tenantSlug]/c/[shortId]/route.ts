import { NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { boxes } from "@/lib/db/schema/network";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Ruta canónica del QR: `https://{tenant.hostname}/c/{shortId}`.
 * Redirige según User-Agent:
 *   - Móvil → `/field/boxes/{id}` (PWA offline-first)
 *   - Escritorio → `/boxes/{id}` (dashboard)
 *
 * Esta ruta NO requiere sesión — el QR se escanea antes del login.
 * Si no hay sesión, Middleware redirigirá al login con next=… y preservará el
 * destino, así que aquí solo nos preocupamos del resolver short_id → id.
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ tenantSlug: string; shortId: string }> },
) {
  const { shortId } = await ctx.params;

  // El header x-tenant-id lo inyecta el middleware tras resolver el hostname
  const h = await headers();
  const tenantId = h.get("x-tenant-id");
  if (!tenantId) return new NextResponse("unknown tenant", { status: 400 });

  const [box] = await db
    .select({ id: boxes.id })
    .from(boxes)
    .where(
      and(
        eq(boxes.organizationId, tenantId),
        eq(boxes.shortId, shortId),
        isNull(boxes.deletedAt),
      ),
    )
    .limit(1);

  if (!box) return NextResponse.redirect(new URL("/?reason=qr_not_found", _req.url));

  const ua = h.get("user-agent") ?? "";
  const isMobile = /Android|iPhone|iPad|Mobile/i.test(ua);
  const target = isMobile ? `/field/boxes/${box.id}` : `/boxes/${box.id}`;
  return NextResponse.redirect(new URL(target, _req.url));
}
