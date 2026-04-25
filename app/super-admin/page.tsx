import Link from "next/link";
import { desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { organizations } from "@/lib/db/schema/tenancy";
import { subscriptions } from "@/lib/db/schema/billing";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

export default async function SuperAdminOrganizationsPage() {
  const rows = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      slug: organizations.slug,
      country: organizations.country,
      createdAt: organizations.createdAt,
    })
    .from(organizations)
    .orderBy(desc(organizations.createdAt));

  const subs = await db.select().from(subscriptions);
  const subByOrg = new Map(subs.map((s) => [s.organizationId, s]));

  return (
    <div className="mx-auto max-w-6xl p-6">
      <h1 className="mb-4 text-2xl font-semibold">Organizaciones ({rows.length})</h1>
      <Table>
        <THead>
          <TR>
            <TH>Nombre</TH>
            <TH>Slug</TH>
            <TH>Plan</TH>
            <TH>Estado</TH>
            <TH>Creada</TH>
            <TH></TH>
          </TR>
        </THead>
        <TBody>
          {rows.map((o) => {
            const s = subByOrg.get(o.id);
            return (
              <TR key={o.id}>
                <TD className="font-medium">{o.name}</TD>
                <TD className="font-mono text-xs">{o.slug}</TD>
                <TD>
                  <Badge tone="info">{s?.plan ?? "—"}</Badge>
                </TD>
                <TD>
                  <Badge tone={s?.status === "active" ? "success" : "warning"}>
                    {s?.status ?? "—"}
                  </Badge>
                </TD>
                <TD className="text-xs text-[var(--color-muted)]">
                  {o.createdAt.toISOString().slice(0, 10)}
                </TD>
                <TD className="text-right">
                  <Link
                    href={`/organizations/${o.id}`}
                    className="text-sm text-[var(--brand-primary)] hover:underline"
                  >
                    Detalle
                  </Link>
                </TD>
              </TR>
            );
          })}
        </TBody>
      </Table>
    </div>
  );
}
