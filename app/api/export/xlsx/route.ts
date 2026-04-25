import ExcelJS from "exceljs";
import { sql, eq, isNull, and } from "drizzle-orm";
import { requireTenantContext } from "@/lib/tenancy/guards";
import { withTenantTx } from "@/lib/tenancy/context";
import { boxes, cables, fibers } from "@/lib/db/schema/network";
import { clients } from "@/lib/db/schema/clients";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/export/xlsx?scope=all|boxes|cables|clients
 * Devuelve un workbook con una hoja por entidad solicitada, incluyendo
 * coordenadas como columnas Lat/Lng y referencias cruzadas por code.
 */
export async function GET(req: Request) {
  const ctx = await requireTenantContext();
  if (!ctx) return new Response("unauthorized", { status: 401 });
  if (!["admin", "manager"].includes(ctx.role)) {
    return new Response("forbidden", { status: 403 });
  }

  const url = new URL(req.url);
  const scope = url.searchParams.get("scope") ?? "all";
  const include = {
    boxes: scope === "all" || scope === "boxes",
    cables: scope === "all" || scope === "cables",
    clients: scope === "all" || scope === "clients",
  };

  const wb = new ExcelJS.Workbook();
  wb.creator = "FibraOS";
  wb.created = new Date();

  await withTenantTx(
    { userId: ctx.userId, organizationId: ctx.organizationId, impersonatedBy: ctx.impersonatedBy },
    async (tx) => {
      if (include.boxes) {
        const rows = await tx
          .select({
            code: boxes.code,
            shortId: boxes.shortId,
            type: boxes.type,
            status: boxes.status,
            address: boxes.address,
            manufacturer: boxes.manufacturer,
            model: boxes.model,
            installed_at: boxes.installedAt,
            lat: sql<number>`ST_Y(${boxes.location}::geometry)`,
            lng: sql<number>`ST_X(${boxes.location}::geometry)`,
            notes: boxes.notes,
          })
          .from(boxes)
          .where(and(eq(boxes.organizationId, ctx.organizationId), isNull(boxes.deletedAt)))
          .orderBy(boxes.code);
        const sheet = wb.addWorksheet("Cajas");
        sheet.columns = [
          { header: "Código", key: "code", width: 18 },
          { header: "Short ID", key: "shortId", width: 12 },
          { header: "Tipo", key: "type", width: 14 },
          { header: "Estado", key: "status", width: 12 },
          { header: "Dirección", key: "address", width: 30 },
          { header: "Fabricante", key: "manufacturer", width: 14 },
          { header: "Modelo", key: "model", width: 14 },
          { header: "Fecha instalación", key: "installed_at", width: 16 },
          { header: "Latitud", key: "lat", width: 12 },
          { header: "Longitud", key: "lng", width: 12 },
          { header: "Notas", key: "notes", width: 30 },
        ];
        sheet.addRows(rows);
        sheet.getRow(1).font = { bold: true };
      }

      if (include.cables) {
        const rows = await tx.execute<{
          code: string;
          type: string;
          standard: string;
          fiber_count: number;
          length_m: string | null;
          source_code: string | null;
          target_code: string | null;
          installed_at: string | null;
          notes: string | null;
        }>(sql`
          SELECT c.code, c.type::text, c.standard::text, c.fiber_count,
                 c.length_m,
                 src.code AS source_code,
                 tgt.code AS target_code,
                 c.installed_at, c.notes
            FROM cables c
            LEFT JOIN boxes src ON src.id = c.source_box_id
            LEFT JOIN boxes tgt ON tgt.id = c.target_box_id
            WHERE c.organization_id = ${ctx.organizationId}::uuid
              AND c.deleted_at IS NULL
            ORDER BY c.code;
        `);
        const sheet = wb.addWorksheet("Cables");
        sheet.columns = [
          { header: "Código", key: "code", width: 20 },
          { header: "Tipo", key: "type", width: 14 },
          { header: "Estándar", key: "standard", width: 10 },
          { header: "Fibras", key: "fiber_count", width: 10 },
          { header: "Longitud (m)", key: "length_m", width: 12 },
          { header: "Origen", key: "source_code", width: 18 },
          { header: "Destino", key: "target_code", width: 18 },
          { header: "Fecha", key: "installed_at", width: 14 },
          { header: "Notas", key: "notes", width: 30 },
        ];
        sheet.addRows(rows);
        sheet.getRow(1).font = { bold: true };
      }

      if (include.clients) {
        const rows = await tx.execute<{
          external_code: string | null;
          name: string;
          document_id: string | null;
          phone: string | null;
          email: string | null;
          address: string;
          ont_serial: string | null;
          ont_model: string | null;
          status: string;
          installed_at: string | null;
          cable_code: string | null;
          fiber_number: number | null;
          lat: number | null;
          lng: number | null;
          notes: string | null;
        }>(sql`
          SELECT cl.external_code, cl.name, cl.document_id, cl.phone, cl.email,
                 cl.address, cl.ont_serial, cl.ont_model, cl.status::text,
                 cl.installed_at,
                 c.code AS cable_code, f.number AS fiber_number,
                 ST_Y(cl.location::geometry) AS lat,
                 ST_X(cl.location::geometry) AS lng,
                 cl.notes
            FROM clients cl
            LEFT JOIN fibers f ON f.id = cl.drop_fiber_id
            LEFT JOIN cables c ON c.id = f.cable_id
            WHERE cl.organization_id = ${ctx.organizationId}::uuid
              AND cl.deleted_at IS NULL
            ORDER BY cl.name;
        `);
        const sheet = wb.addWorksheet("Clientes");
        sheet.columns = [
          { header: "ID Cliente", key: "external_code", width: 14 },
          { header: "Nombre", key: "name", width: 25 },
          { header: "DNI", key: "document_id", width: 12 },
          { header: "Teléfono", key: "phone", width: 14 },
          { header: "Email", key: "email", width: 25 },
          { header: "Dirección", key: "address", width: 30 },
          { header: "ONT Serial", key: "ont_serial", width: 14 },
          { header: "ONT Modelo", key: "ont_model", width: 14 },
          { header: "Estado", key: "status", width: 10 },
          { header: "Alta", key: "installed_at", width: 12 },
          { header: "Cable drop", key: "cable_code", width: 16 },
          { header: "Fibra drop", key: "fiber_number", width: 10 },
          { header: "Latitud", key: "lat", width: 12 },
          { header: "Longitud", key: "lng", width: 12 },
          { header: "Notas", key: "notes", width: 30 },
        ];
        sheet.addRows(rows);
        sheet.getRow(1).font = { bold: true };
      }

      // suppress unused import of fibers without actual use
      void fibers;
    },
  );

  const buf = await wb.xlsx.writeBuffer();
  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(buf as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="fibraos-${ctx.organizationSlug}-${stamp}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
