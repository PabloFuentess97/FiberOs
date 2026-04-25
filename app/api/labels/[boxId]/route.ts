import { renderToBuffer } from "@react-pdf/renderer";
import { and, eq, isNull, sql } from "drizzle-orm";
import { headers } from "next/headers";
import { requireTenantContext } from "@/lib/tenancy/guards";
import { db } from "@/lib/db";
import { boxes } from "@/lib/db/schema/network";
import { tenantBranding } from "@/lib/db/schema/tenancy";
import { LabelsDocument, qrPngDataUrl, type LabelFormat } from "@/lib/labels/pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/labels/[boxId]?format=A4|small
 * Devuelve un PDF imprimible con el QR + metadata. `boxId=all` genera
 * un A4 con todas las cajas activas del tenant (paginado: 8 por página).
 */
export async function GET(req: Request, ctx: { params: Promise<{ boxId: string }> }) {
  const auth = await requireTenantContext();
  if (!auth) return new Response("unauthorized", { status: 401 });

  const { boxId } = await ctx.params;
  const url = new URL(req.url);
  const format = (url.searchParams.get("format") ?? "A4") as LabelFormat;

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost";
  const scheme = h.get("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https");

  const rows =
    boxId === "all"
      ? await db
          .select({
            code: boxes.code,
            shortId: boxes.shortId,
            type: boxes.type,
            address: boxes.address,
            lat: sql<number>`ST_Y(${boxes.location}::geometry)`,
            lng: sql<number>`ST_X(${boxes.location}::geometry)`,
          })
          .from(boxes)
          .where(and(eq(boxes.organizationId, auth.organizationId), isNull(boxes.deletedAt)))
          .orderBy(boxes.code)
      : await db
          .select({
            code: boxes.code,
            shortId: boxes.shortId,
            type: boxes.type,
            address: boxes.address,
            lat: sql<number>`ST_Y(${boxes.location}::geometry)`,
            lng: sql<number>`ST_X(${boxes.location}::geometry)`,
          })
          .from(boxes)
          .where(
            and(
              eq(boxes.organizationId, auth.organizationId),
              eq(boxes.id, boxId),
              isNull(boxes.deletedAt),
            ),
          )
          .limit(1);

  if (rows.length === 0) return new Response("not found", { status: 404 });

  // Branding del tenant (colores, nombre)
  const [branding] = await db
    .select()
    .from(tenantBranding)
    .where(eq(tenantBranding.organizationId, auth.organizationId))
    .limit(1);

  // Generar QR data URL por caja (en paralelo, limitado a 8 concurrentes no es crítico aquí)
  const labelBoxes = rows.map((b) => ({
    ...b,
    qrUrl: `${scheme}://${host}/c/${b.shortId}`,
  }));
  const qrEntries = await Promise.all(
    labelBoxes.map(async (b) => [b.shortId, await qrPngDataUrl(b.qrUrl)] as const),
  );
  const qrDataByShort = Object.fromEntries(qrEntries);

  const pdf = await renderToBuffer(
    LabelsDocument({
      boxes: labelBoxes,
      branding: {
        displayName: branding?.displayName ?? "FibraOS",
        primaryColor: branding?.primaryColor ?? "#1E5FFF",
        supportEmail: branding?.supportEmail ?? null,
      },
      qrDataByShort,
      format,
    }),
  );

  return new Response(pdf as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="labels-${boxId}-${format}.pdf"`,
      "Cache-Control": "private, max-age=60",
    },
  });
}
