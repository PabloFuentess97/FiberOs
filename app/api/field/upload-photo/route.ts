import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTenantContext } from "@/lib/tenancy/guards";
import { withTenantTx } from "@/lib/tenancy/context";
import { files } from "@/lib/db/schema/field";
import { signPutUrl, publicUrl } from "@/lib/storage/s3";
import { logger } from "@/lib/observability/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const requestSchema = z.object({
  mime: z.string().regex(/^image\/(webp|jpeg|png)$/),
  sizeBytes: z.number().int().positive().max(10_000_000), // 10 MB máx
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  relatedTable: z.enum(["fusions", "boxes", "clients"]).optional(),
  relatedId: z.string().uuid().optional(),
});

/**
 * Paso 1 de upload: devuelve URL firmada (S3/MinIO/R2) + file_id pre-creado.
 * El cliente PUT a esa URL con el blob comprimido, luego llama al Paso 2.
 */
export async function POST(req: Request) {
  const ctx = await requireTenantContext();
  if (!ctx) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const parsed = requestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "validation_error" }, { status: 400 });
  }
  const input = parsed.data;

  const fileId = crypto.randomUUID();
  const ext = input.mime.replace("image/", "");
  const key = `org/${ctx.organizationId}/${new Date().toISOString().slice(0, 10)}/${fileId}.${ext}`;

  try {
    const [uploadUrl, _row] = await Promise.all([
      signPutUrl(key, input.mime),
      withTenantTx(
        { userId: ctx.userId, organizationId: ctx.organizationId, impersonatedBy: ctx.impersonatedBy },
        async (tx) =>
          tx
            .insert(files)
            .values({
              id: fileId,
              organizationId: ctx.organizationId,
              storageKey: key,
              mime: input.mime,
              sizeBytes: input.sizeBytes,
              width: input.width ?? null,
              height: input.height ?? null,
              relatedTable: input.relatedTable ?? null,
              relatedId: input.relatedId ?? null,
              visibility: "private",
              uploadedBy: ctx.userId,
            })
            .returning({ id: files.id }),
      ),
    ]);

    return NextResponse.json({
      ok: true,
      data: {
        fileId,
        uploadUrl,
        publicUrl: publicUrl(key),
        expiresIn: 900,
      },
    });
  } catch (err) {
    logger.error({ err }, "upload-photo failed");
    return NextResponse.json({ ok: false, error: "internal" }, { status: 500 });
  }
}
