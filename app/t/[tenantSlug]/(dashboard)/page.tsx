import { and, eq, isNull } from "drizzle-orm";
import { Box, Cable, Users, Zap } from "lucide-react";
import { db } from "@/lib/db";
import { boxes, cables } from "@/lib/db/schema/network";
import { requireTenantContext } from "@/lib/tenancy/guards";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";

export default async function DashboardHome() {
  const ctx = await requireTenantContext();
  if (!ctx) return null;

  const [boxCount, cableCount] = await Promise.all([
    db
      .$count(boxes, and(eq(boxes.organizationId, ctx.organizationId), isNull(boxes.deletedAt))),
    db
      .$count(cables, and(eq(cables.organizationId, ctx.organizationId), isNull(cables.deletedAt))),
  ]);

  const kpis = [
    { label: "Cajas", value: boxCount, icon: Box },
    { label: "Cables", value: cableCount, icon: Cable },
    { label: "Fibras en uso", value: "—", icon: Zap, hint: "Sprint 3" },
    { label: "Clientes activos", value: "—", icon: Users, hint: "Sprint 4" },
  ];

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Hola, {ctx.email.split("@")[0]}</h1>
        <p className="text-sm text-[var(--color-muted)]">
          Resumen de {ctx.organizationSlug}.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {kpis.map(({ label, value, icon: Icon, hint }) => (
          <Card key={label}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-[var(--color-muted)]">
                  {label}
                </CardTitle>
                <Icon size={18} className="text-[var(--color-muted)]" />
              </div>
              <CardDescription>
                <span className="text-3xl font-semibold text-[var(--color-foreground)]">
                  {value}
                </span>
                {hint ? <span className="ml-2 text-xs">{hint}</span> : null}
              </CardDescription>
            </CardHeader>
          </Card>
        ))}
      </div>
    </div>
  );
}
