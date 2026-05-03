import { NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { boxes } from "@/lib/db/schema/network";
import { organizations, tenantDomains } from "@/lib/db/schema/tenancy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Ruta canónica del QR: `https://{tenant.hostname}/c/{shortId}`.
 * Redirige según User-Agent: móvil → `/field/boxes/{id}`, escritorio → `/boxes/{id}`.
 * No requiere sesión: el QR se escanea antes del login.
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ tenantSlug: string; shortId: string }> },
) {
  const { tenantSlug, shortId } = await ctx.params;
  const h = await headers();
  const tenantHost = h.get("x-tenant-host");

  // Resolver tenant a partir del slug del path o del host (custom domain)
  let orgId: string | null = null;
  if (tenantSlug && tenantSlug !== "__by_host__") {
    const [row] = await db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.slug, tenantSlug))
      .limit(1);
    if (row) orgId = row.id;
  } else if (tenantHost) {
    const [row] = await db
      .select({ id: organizations.id })
      .from(tenantDomains)
      .innerJoin(organizations, eq(organizations.id, tenantDomains.organizationId))
      .where(eq(tenantDomains.hostname, tenantHost))
      .limit(1);
    if (row) orgId = row.id;
  }
  if (!orgId) return new NextResponse("unknown tenant", { status: 400 });

  const [box] = await db
    .select({ id: boxes.id })
    .from(boxes)
    .where(
      and(
        eq(boxes.organizationId, orgId),
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
