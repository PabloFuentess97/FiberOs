import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTenantContext } from "@/lib/tenancy/guards";
import { withTenantTx } from "@/lib/tenancy/context";
import { importJobs } from "@/lib/db/schema/imports";
import { files } from "@/lib/db/schema/field";
import { importsQueue } from "@/lib/queues";
import { signPutUrl } from "@/lib/storage/s3";
import { parseXlsx, parseCsv } from "@/lib/importer/parser";
import { proposeMapping, type EntityType } from "@/lib/importer/mapping";
import { logger } from "@/lib/observability/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ============ POST /api/import/upload-url ============
// Paso 1: cliente solicita URL firmada para subir XLSX/CSV. Devuelve fileId.
const uploadSchema = z.object({
  filename: z.string().min(1).max(200),
  mime: z.string(),
  sizeBytes: z.number().int().positive().max(50_000_000),
});

// ============ POST /api/import ============
// Paso 2: cliente envía mapping + entityType + fileId (ya subido). El servidor
// lee el fichero, parsea headers (rápido) y encola el job.
const createSchema = z.object({
  entityType: z.enum(["boxes", "cables", "clients"]),
  filename: z.string().min(1),
  storageKey: z.string().min(1),
  sourceFileId: z.string().uuid().optional(),
  mapping: z.record(
    z.string(),
    z.object({ column: z.string(), transforms: z.array(z.string()).default([]) }),
  ),
  dryRun: z.boolean().default(false),
});

export async function POST(req: Request) {
  const ctx = await requireTenantContext();
  if (!ctx) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (!["admin", "manager"].includes(ctx.role)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "validation_error" }, { status: 400 });
  }
  const input = parsed.data;

  try {
    const jobId = await withTenantTx(
      { userId: ctx.userId, organizationId: ctx.organizationId, impersonatedBy: ctx.impersonatedBy },
      async (tx) => {
        const [row] = await tx
          .insert(importJobs)
          .values({
            organizationId: ctx.organizationId,
            userId: ctx.userId,
            sourceFileId: input.sourceFileId ?? null,
            sourceFilename: input.filename,
            entityType: input.entityType,
            mapping: input.mapping,
            dryRun: input.dryRun,
            status: "pending",
          })
          .returning({ id: importJobs.id });
        if (!row) throw new Error("insert failed");
        return row.id;
      },
    );

    await importsQueue().add(
      `import:${jobId}`,
      {
        jobId,
        organizationId: ctx.organizationId,
        userId: ctx.userId,
        entityType: input.entityType,
        mapping: input.mapping,
        dryRun: input.dryRun,
        storageKey: input.storageKey,
        filename: input.filename,
      },
      { jobId },
    );

    return NextResponse.json({ ok: true, data: { jobId } });
  } catch (err) {
    logger.error({ err }, "import_enqueue_failed");
    return NextResponse.json({ ok: false, error: "internal" }, { status: 500 });
  }
}

// ============ POST /api/import/preview ============
// Análisis inmediato (sin cola) para proponer mapping y mostrar 20 filas.
// Se llama con FormData (file binary).
export async function PUT(req: Request) {
  const ctx = await requireTenantContext();
  if (!ctx) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const entityType = url.searchParams.get("entityType") as EntityType | null;
  if (!entityType) return NextResponse.json({ ok: false, error: "missing_entity" }, { status: 400 });

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof Blob)) {
    return NextResponse.json({ ok: false, error: "missing_file" }, { status: 400 });
  }

  const buf = await file.arrayBuffer();
  const isXlsx = /\.xlsx$/i.test((file as File).name ?? "");
  const parsed = isXlsx
    ? await parseXlsx(buf)
    : await parseCsv(new TextDecoder().decode(buf));

  const mapping = proposeMapping(parsed.headers, entityType);

  return NextResponse.json({
    ok: true,
    data: {
      headers: parsed.headers,
      totalRows: parsed.totalRows,
      preview: parsed.rows.slice(0, 20),
      proposedMapping: mapping,
    },
  });
}

// ============ GET /api/import/upload-url ============
export async function GET(req: Request) {
  const ctx = await requireTenantContext();
  if (!ctx) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  const filename = url.searchParams.get("filename");
  const mime = url.searchParams.get("mime") ?? "application/octet-stream";
  const size = Number(url.searchParams.get("sizeBytes") ?? "0");
  const val = uploadSchema.safeParse({ filename, mime, sizeBytes: size });
  if (!val.success) return NextResponse.json({ ok: false, error: "validation_error" }, { status: 400 });

  const fileId = crypto.randomUUID();
  const ext = filename!.split(".").pop()?.toLowerCase() ?? "xlsx";
  const key = `org/${ctx.organizationId}/imports/${fileId}.${ext}`;

  try {
    const uploadUrl = await signPutUrl(key, mime, 900);
    await withTenantTx(
      { userId: ctx.userId, organizationId: ctx.organizationId, impersonatedBy: ctx.impersonatedBy },
      async (tx) => {
        await tx.insert(files).values({
          id: fileId,
          organizationId: ctx.organizationId,
          storageKey: key,
          mime,
          sizeBytes: size,
          visibility: "private",
          uploadedBy: ctx.userId,
        });
      },
    );

    return NextResponse.json({ ok: true, data: { fileId, uploadUrl, storageKey: key } });
  } catch (err) {
    logger.error({ err }, "import_upload_url_failed");
    return NextResponse.json({ ok: false, error: "internal" }, { status: 500 });
  }
}
