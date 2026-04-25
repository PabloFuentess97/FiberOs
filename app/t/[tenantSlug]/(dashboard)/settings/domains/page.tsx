import { and, eq } from "drizzle-orm";
import { requireTenantContext } from "@/lib/tenancy/guards";
import { db } from "@/lib/db";
import { tenantDomains } from "@/lib/db/schema/tenancy";
import { DomainsClient } from "./domains-client";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RefreshCw } from "lucide-react";
import { retryVerificationAction, removeDomainAction } from "./actions";
import { Button } from "@/components/ui/button";

const STATUS_TONE: Record<string, "success" | "warning" | "destructive" | "info" | "neutral"> = {
  active: "success",
  verifying: "info",
  pending_dns: "warning",
  failed: "destructive",
  disabled: "neutral",
};

export default async function DomainsSettingsPage() {
  const ctx = await requireTenantContext();
  if (!ctx) return null;

  const rows = await db
    .select()
    .from(tenantDomains)
    .where(eq(tenantDomains.organizationId, ctx.organizationId))
    .orderBy(tenantDomains.createdAt);

  return (
    <div className="mx-auto max-w-4xl p-6">
      <h1 className="text-2xl font-semibold">Dominios</h1>
      <p className="mt-1 mb-6 text-sm text-[var(--color-muted)]">
        Usa tu propio hostname (p.ej. <code>red.tuoperador.es</code>) con HTTPS automático.
        Requiere plan Pro o superior.
      </p>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Añadir dominio personalizado</CardTitle>
        </CardHeader>
        <CardContent>
          <DomainsClient />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tus dominios ({rows.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {rows.length === 0 ? (
            <p className="text-sm text-[var(--color-muted)]">Aún no hay dominios.</p>
          ) : null}
          {rows.map((d) => (
            <div
              key={d.id}
              className="flex items-center justify-between rounded-md border border-[var(--color-border)] bg-white p-3"
            >
              <div>
                <div className="font-mono text-sm">{d.hostname}</div>
                <div className="mt-1 flex items-center gap-2 text-xs text-[var(--color-muted)]">
                  <Badge tone={STATUS_TONE[d.status] ?? "neutral"}>{d.status}</Badge>
                  {d.isPrimary ? <Badge tone="info">primario</Badge> : null}
                  {d.isSubdomain ? <Badge>subdominio</Badge> : <Badge>custom</Badge>}
                  {d.lastCheckError ? (
                    <span className="text-[var(--color-destructive)]">· {d.lastCheckError}</span>
                  ) : null}
                </div>
              </div>
              <div className="flex gap-2">
                {d.status === "pending_dns" || d.status === "failed" ? (
                  <form action={retryVerificationAction}>
                    <input type="hidden" name="id" value={d.id} />
                    <Button type="submit" size="sm" variant="outline">
                      <RefreshCw size={12} /> Revisar DNS
                    </Button>
                  </form>
                ) : null}
                {!d.isSubdomain ? (
                  <form action={removeDomainAction}>
                    <input type="hidden" name="id" value={d.id} />
                    <Button type="submit" size="sm" variant="outline">
                      Eliminar
                    </Button>
                  </form>
                ) : null}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
      {void and && null}
    </div>
  );
}
