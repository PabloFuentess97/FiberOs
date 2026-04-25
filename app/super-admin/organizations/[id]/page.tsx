import Link from "next/link";
import { eq, count } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { organizations, organizationMembers, tenantDomains } from "@/lib/db/schema/tenancy";
import { subscriptions } from "@/lib/db/schema/billing";
import { users } from "@/lib/db/schema/auth";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ImpersonateDialog } from "./impersonate-dialog";

export default async function OrganizationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [org] = await db.select().from(organizations).where(eq(organizations.id, id)).limit(1);
  if (!org) notFound();

  const [sub] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.organizationId, id))
    .limit(1);

  const members = await db
    .select({
      role: organizationMembers.role,
      userId: organizationMembers.userId,
      email: users.email,
      name: users.name,
    })
    .from(organizationMembers)
    .innerJoin(users, eq(users.id, organizationMembers.userId))
    .where(eq(organizationMembers.organizationId, id));

  const domains = await db.select().from(tenantDomains).where(eq(tenantDomains.organizationId, id));

  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="mb-4 flex items-center gap-2 text-sm text-[var(--color-muted)]">
        <Link href="/" className="hover:underline">← Organizaciones</Link>
      </div>
      <h1 className="text-2xl font-semibold">{org.name}</h1>
      <p className="mt-1 mb-6 text-sm text-[var(--color-muted)]">
        <code>{org.slug}</code> · {org.country}
      </p>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Suscripción</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Plan" value={sub?.plan ?? "—"} />
            <Row label="Estado" value={sub?.status ?? "—"} />
            <Row
              label="Trial expira"
              value={sub?.trialEndsAt?.toISOString().slice(0, 10) ?? "—"}
            />
            <Row
              label="Renovación"
              value={sub?.currentPeriodEndsAt?.toISOString().slice(0, 10) ?? "—"}
            />
            <Row label="Stripe customer" value={sub?.stripeCustomerId ?? "—"} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Miembros ({members.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1 text-sm">
              {members.map((m) => (
                <li key={m.userId} className="flex items-center justify-between">
                  <span>
                    <span className="font-medium">{m.name ?? m.email}</span>
                    <span className="ml-2 text-xs text-[var(--color-muted)]">{m.email}</span>
                  </span>
                  <div className="flex items-center gap-2">
                    <Badge tone="info">{m.role}</Badge>
                    <ImpersonateDialog
                      targetUserId={m.userId}
                      targetEmail={m.email}
                      organizationId={id}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Dominios ({domains.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1 text-sm">
              {domains.map((d) => (
                <li key={d.id} className="flex items-center justify-between font-mono text-xs">
                  <span>{d.hostname}</span>
                  <Badge
                    tone={
                      d.status === "active"
                        ? "success"
                        : d.status === "failed"
                          ? "destructive"
                          : "warning"
                    }
                  >
                    {d.status}
                  </Badge>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
      {void count && null}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-[var(--color-border)]/60 py-1 last:border-0">
      <span className="text-[var(--color-muted)]">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}
