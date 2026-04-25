import Link from "next/link";
import { Plus } from "lucide-react";
import { requireTenantContext } from "@/lib/tenancy/guards";
import { withTenantTx } from "@/lib/tenancy/context";
import { listCables } from "@/lib/db/queries/cables";
import { Button } from "@/components/ui/button";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

const CABLE_LABEL: Record<string, string> = {
  main_trunk: "Troncal principal",
  trunk: "Troncal",
  subtrunk: "Subtroncal",
  drop: "Acometida",
};

export default async function CablesListPage() {
  const ctx = await requireTenantContext();
  if (!ctx) return null;

  const { rows } = await withTenantTx(
    { userId: ctx.userId, organizationId: ctx.organizationId, impersonatedBy: ctx.impersonatedBy },
    async () => listCables(ctx.organizationId),
  );

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Cables</h1>
          <p className="text-sm text-[var(--color-muted)]">
            Cables ópticos con trazado geográfico y fibras individuales.
          </p>
        </div>
        <Button asChild>
          <Link href="/cables/new" className="inline-flex items-center gap-2">
            <Plus size={16} /> Añadir cable
          </Link>
        </Button>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[var(--color-border)] p-10 text-center text-sm text-[var(--color-muted)]">
          Aún no hay cables.{" "}
          <Link href="/map" className="text-[var(--brand-primary)] underline">
            Dibuja uno en el mapa
          </Link>
          .
        </div>
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Código</TH>
              <TH>Tipo</TH>
              <TH>Fibras</TH>
              <TH>Longitud (m)</TH>
              <TH>Origen → Destino</TH>
              <TH></TH>
            </TR>
          </THead>
          <TBody>
            {rows.map((c) => (
              <TR key={c.id}>
                <TD className="font-mono text-xs">{c.code}</TD>
                <TD>
                  <Badge tone="info">{CABLE_LABEL[c.type] ?? c.type}</Badge>
                </TD>
                <TD>{c.fiberCount}</TD>
                <TD>{c.lengthM ?? "—"}</TD>
                <TD className="text-xs text-[var(--color-muted)]">
                  {c.sourceCode ?? "?"} → {c.targetCode ?? "?"}
                </TD>
                <TD className="text-right">
                  <Link
                    href={`/cables/${c.id}`}
                    className="text-sm text-[var(--brand-primary)] hover:underline"
                  >
                    Ver
                  </Link>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </div>
  );
}
