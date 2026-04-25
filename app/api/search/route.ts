import { NextResponse } from "next/server";
import { requireTenantContext } from "@/lib/tenancy/guards";
import { withTenantTx } from "@/lib/tenancy/context";
import { searchEntities } from "@/lib/db/queries/search";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const ctx = await requireTenantContext();
  if (!ctx) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const q = url.searchParams.get("q") ?? "";
  if (!q.trim()) return NextResponse.json({ ok: true, data: [] });

  const hits = await withTenantTx(
    { userId: ctx.userId, organizationId: ctx.organizationId, impersonatedBy: ctx.impersonatedBy },
    async () => searchEntities(q, 20),
  );

  return NextResponse.json({ ok: true, data: hits });
}
