import { NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { requireTenantContext } from "@/lib/tenancy/guards";
import { db } from "@/lib/db";
import { importJobs } from "@/lib/db/schema/imports";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireTenantContext();
  if (!auth) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const [row] = await db
    .select()
    .from(importJobs)
    .where(and(eq(importJobs.id, id), eq(importJobs.organizationId, auth.organizationId)))
    .limit(1);
  if (!row) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  return NextResponse.json({
    ok: true,
    data: {
      id: row.id,
      status: row.status,
      entityType: row.entityType,
      totalRows: row.totalRows,
      processedRows: row.processedRows,
      createdRows: row.createdRows,
      updatedRows: row.updatedRows,
      errorRows: row.errorRows,
      errors: row.errors,
      dryRun: row.dryRun,
      startedAt: row.startedAt,
      finishedAt: row.finishedAt,
    },
  });
}
