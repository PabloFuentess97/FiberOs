import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { eq, and, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { boxes } from "@/lib/db/schema/network";
import { requireTenantContext } from "@/lib/tenancy/guards";
import { headers } from "next/headers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * PNG 512×512 del QR para imprimir en la caja. URL codificada:
 *   https://{tenant.hostname}/c/{shortId}
 * Al escanearlo el browser hace un GET que redirige a /field/... o /boxes/...
 * según el User-Agent.
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ shortId: string }> },
) {
  const auth = await requireTenantContext();
  if (!auth) return new NextResponse("unauthorized", { status: 401 });

  const { shortId } = await ctx.params;
  const [box] = await db
    .select({ id: boxes.id, shortId: boxes.shortId })
    .from(boxes)
    .where(
      and(
        eq(boxes.organizationId, auth.organizationId),
        eq(boxes.shortId, shortId),
        isNull(boxes.deletedAt),
      ),
    )
    .limit(1);
  if (!box) return new NextResponse("not found", { status: 404 });

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost";
  const scheme = h.get("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https");
  const url = `${scheme}://${host}/c/${box.shortId}`;

  const buffer = await QRCode.toBuffer(url, {
    errorCorrectionLevel: "M",
    width: 512,
    margin: 2,
    color: { dark: "#0F172A", light: "#FFFFFF" },
  });

  return new NextResponse(buffer as unknown as BodyInit, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "private, max-age=3600",
    },
  });
}
