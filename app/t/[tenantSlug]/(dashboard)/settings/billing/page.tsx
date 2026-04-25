import { eq, and, isNull, count } from "drizzle-orm";
import { ExternalLink } from "lucide-react";
import { requireTenantContext } from "@/lib/tenancy/guards";
import { db } from "@/lib/db";
import { subscriptions, planQuotas } from "@/lib/db/schema/billing";
import { clients } from "@/lib/db/schema/clients";
import { organizationMembers } from "@/lib/db/schema/tenancy";
import { startCheckoutAction, openPortalAction } from "./actions";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const PRICES: Record<string, { label: string; amount: string }> = {
  trial: { label: "Trial", amount: "gratis 14 días" },
  starter: { label: "Starter", amount: "39 €/mes" },
  pro: { label: "Pro", amount: "129 €/mes" },
  business: { label: "Business", amount: "349 €/mes" },
  enterprise: { label: "Enterprise", amount: "a medida" },
};

export default async function BillingPage() {
  const ctx = await requireTenantContext();
  if (!ctx) return null;

  const [sub] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.organizationId, ctx.organizationId))
    .limit(1);

  const [quota] = sub
    ? await db.select().from(planQuotas).where(eq(planQuotas.plan, sub.plan)).limit(1)
    : [];

  const [[clientCount], [userCount]] = await Promise.all([
    db
      .select({ n: count() })
      .from(clients)
      .where(and(eq(clients.organizationId, ctx.organizationId), isNull(clients.deletedAt))),
    db
      .select({ n: count() })
      .from(organizationMembers)
      .where(eq(organizationMembers.organizationId, ctx.organizationId)),
  ]);

  const currentPlan = sub?.plan ?? "trial";
  const price = PRICES[currentPlan];

  return (
    <div className="mx-auto max-w-4xl p-6">
      <h1 className="text-2xl font-semibold">Facturación</h1>
      <p className="mt-1 mb-6 text-sm text-[var(--color-muted)]">
        Tu plan, uso actual y gestión de pagos via Stripe.
      </p>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Plan actual</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center gap-2">
              <Badge tone={sub?.status === "active" ? "success" : "warning"}>{sub?.status ?? "—"}</Badge>
              <span className="text-xl font-semibold">{price?.label}</span>
              <span className="text-sm text-[var(--color-muted)]">· {price?.amount}</span>
            </div>
            {sub?.trialEndsAt && sub.status === "trialing" ? (
              <p className="text-xs text-[var(--color-muted)]">
                Trial termina: {sub.trialEndsAt.toISOString().slice(0, 10)}
              </p>
            ) : null}
            {sub?.currentPeriodEndsAt ? (
              <p className="text-xs text-[var(--color-muted)]">
                Próxima renovación: {sub.currentPeriodEndsAt.toISOString().slice(0, 10)}
              </p>
            ) : null}
            {ctx.role === "admin" ? (
              <form action={openPortalAction}>
                <Button type="submit" variant="outline" className="mt-3">
                  <ExternalLink size={14} /> Portal de cliente (Stripe)
                </Button>
              </form>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Uso</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <UsageRow
              label="Clientes"
              current={clientCount?.n ?? 0}
              limit={quota?.clientLimit ?? null}
            />
            <UsageRow
              label="Usuarios"
              current={userCount?.n ?? 0}
              limit={quota?.userLimit ?? null}
            />
            <UsageRow
              label="Dominios custom"
              current={0}
              limit={quota?.customDomainLimit ?? 0}
            />
          </CardContent>
        </Card>
      </div>

      {ctx.role === "admin" ? (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Cambiar plan</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 md:grid-cols-3">
              {(["starter", "pro", "business"] as const).map((plan) => (
                <div
                  key={plan}
                  className="rounded-lg border border-[var(--color-border)] bg-white p-4"
                >
                  <div className="mb-2 font-semibold">{PRICES[plan]?.label}</div>
                  <div className="mb-3 text-sm text-[var(--color-muted)]">{PRICES[plan]?.amount}</div>
                  <form action={startCheckoutAction}>
                    <input type="hidden" name="plan" value={plan} />
                    <Button
                      type="submit"
                      variant={currentPlan === plan ? "outline" : "primary"}
                      size="sm"
                      className="w-full"
                      disabled={currentPlan === plan && sub?.status === "active"}
                    >
                      {currentPlan === plan && sub?.status === "active"
                        ? "Plan actual"
                        : "Cambiar"}
                    </Button>
                  </form>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function UsageRow({ label, current, limit }: { label: string; current: number; limit: number | null }) {
  const pct = limit == null ? 0 : Math.min(100, (current / Math.max(1, limit)) * 100);
  const near = pct > 85;
  return (
    <div>
      <div className="flex justify-between">
        <span className="text-[var(--color-muted)]">{label}</span>
        <span className={near ? "font-medium text-[var(--color-destructive)]" : "font-medium"}>
          {current} {limit != null ? `/ ${limit}` : "(ilimitado)"}
        </span>
      </div>
      {limit != null ? (
        <div className="mt-1 h-1.5 rounded bg-[var(--color-surface)]">
          <div
            className="h-full rounded"
            style={{
              width: `${pct}%`,
              background: near ? "var(--color-destructive)" : "var(--brand-primary)",
            }}
          />
        </div>
      ) : null}
    </div>
  );
}
