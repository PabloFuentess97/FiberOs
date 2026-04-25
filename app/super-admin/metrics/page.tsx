import { count, sql, eq, isNull, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { organizations } from "@/lib/db/schema/tenancy";
import { subscriptions } from "@/lib/db/schema/billing";
import { clients } from "@/lib/db/schema/clients";
import { boxes } from "@/lib/db/schema/network";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

export default async function SuperAdminMetricsPage() {
  const [
    [{ orgs = 0 } = {}],
    subs,
    [{ totalClients = 0 } = {}],
    [{ totalBoxes = 0 } = {}],
  ] = await Promise.all([
    db.select({ orgs: count() }).from(organizations),
    db.select({ plan: subscriptions.plan, status: subscriptions.status }).from(subscriptions),
    db
      .select({ totalClients: count() })
      .from(clients)
      .where(isNull(clients.deletedAt)),
    db
      .select({ totalBoxes: count() })
      .from(boxes)
      .where(isNull(boxes.deletedAt)),
  ]);

  const planDist = new Map<string, number>();
  const statusDist = new Map<string, number>();
  for (const s of subs) {
    planDist.set(s.plan, (planDist.get(s.plan) ?? 0) + 1);
    statusDist.set(s.status, (statusDist.get(s.status) ?? 0) + 1);
  }

  // MRR estimado (€) basado en PRICES
  const PLAN_MRR: Record<string, number> = { starter: 39, pro: 129, business: 349 };
  let mrr = 0;
  for (const s of subs.filter((x) => x.status === "active")) {
    mrr += PLAN_MRR[s.plan] ?? 0;
  }

  return (
    <div className="mx-auto max-w-5xl p-6">
      <h1 className="mb-6 text-2xl font-semibold">Métricas globales</h1>
      <div className="grid gap-4 md:grid-cols-4">
        <Kpi label="Organizaciones" value={orgs} />
        <Kpi label="MRR estimado (€)" value={mrr} />
        <Kpi label="Clientes finales" value={totalClients} />
        <Kpi label="Cajas totales" value={totalBoxes} />
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Por plan</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="text-sm">
              {Array.from(planDist.entries()).map(([p, n]) => (
                <li key={p} className="flex justify-between border-b border-[var(--color-border)]/60 py-1 last:border-0">
                  <span className="capitalize">{p}</span>
                  <span className="font-medium">{n}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Por estado</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="text-sm">
              {Array.from(statusDist.entries()).map(([s, n]) => (
                <li key={s} className="flex justify-between border-b border-[var(--color-border)]/60 py-1 last:border-0">
                  <span>{s}</span>
                  <span className="font-medium">{n}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
      {void [sql, eq, and] && null}
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium text-[var(--color-muted)]">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-semibold">{value.toLocaleString("es-ES")}</div>
      </CardContent>
    </Card>
  );
}
