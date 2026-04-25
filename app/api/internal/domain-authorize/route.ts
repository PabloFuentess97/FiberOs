import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { tenantDomains } from "@/lib/db/schema/tenancy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Endpoint `ask` de Caddy `on_demand_tls` (§31.6 del blueprint).
 *
 * Caddy lo consulta antes de pedir un cert Let's Encrypt. Solo devolvemos
 * 200 si el hostname ya fue verificado por DNS (status `verifying` o `active`),
 * evitando que un atacante apunte su DNS a nuestro servidor y nos consuma
 * el rate limit de LE.
 *
 * Header `X-Internal-Secret` impide peticiones externas al endpoint.
 */
export async function GET(req: Request) {
  const secret = req.headers.get("x-internal-secret");
  if (secret !== process.env.INTERNAL_API_SECRET) {
    return new NextResponse("forbidden", { status: 403 });
  }
  const url = new URL(req.url);
  const domain = url.searchParams.get("domain")?.toLowerCase();
  if (!domain) return new NextResponse("bad", { status: 400 });

  // Lookup sin RLS: este endpoint opera con la BD directamente (no tenant context).
  // Filtramos solo por hostname, el resultado nunca cruza organizaciones.
  const [row] = await db
    .select({ status: tenantDomains.status })
    .from(tenantDomains)
    .where(eq(tenantDomains.hostname, domain))
    .limit(1);

  if (!row || !["verifying", "active"].includes(row.status)) {
    return new NextResponse("not authorized", { status: 403 });
  }
  return new NextResponse("ok", { status: 200 });
}
