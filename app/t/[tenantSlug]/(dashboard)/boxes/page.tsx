import Link from "next/link";
import { Plus } from "lucide-react";
import { sql } from "drizzle-orm";
import { withTenantTx } from "@/lib/tenancy/context";
import { requireTenantContext } from "@/lib/tenancy/guards";
import { listBoxes } from "@/lib/db/queries/boxes";
import { BOX_TYPE_META } from "@/lib/geo/markers";
import { Button } from "@/components/ui/button";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

interface Props {
  searchParams: Promise<{ search?: string; type?: string; status?: string }>;
}

export default async function BoxesListPage({ searchParams }: Props) {
  const ctx = await requireTenantContext();
  if (!ctx) return null;
  const sp = await searchParams;

  // Usamos withTenantTx para que RLS se aplique incluso en lecturas.
  const { rows } = await withTenantTx(
    { userId: ctx.userId, organizationId: ctx.organizationId, impersonatedBy: ctx.impersonatedBy },
    async () =>
      listBoxes(ctx.organizationId, {
        search: sp.search,
        type: sp.type as never,
        status: sp.status as never,
      }),
  );
  // Suppress unused sql import warning when RLS cascade changes
  void sql;

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Cajas</h1>
          <p className="text-sm text-[var(--color-muted)]">
            Inventario de cajas de red (cabeceras, troncales, CTOs, arquetas).
          </p>
        </div>
        <Button asChild>
          <Link href="/boxes/new" className="inline-flex items-center gap-2">
            <Plus size={16} /> Añadir caja
          </Link>
        </Button>
      </div>

      <form className="mb-4 flex gap-2" action="/boxes">
        <input
          type="text"
          name="search"
          placeholder="Código, dirección, notas…"
          defaultValue={sp.search ?? ""}
          className="h-9 flex-1 rounded-md border border-[var(--color-border)] bg-white px-3 text-sm"
        />
        <select
          name="type"
          defaultValue={sp.type ?? ""}
          className="h-9 rounded-md border border-[var(--color-border)] bg-white px-3 text-sm"
        >
          <option value="">Todos los tipos</option>
          {Object.entries(BOX_TYPE_META).map(([k, v]) => (
            <option key={k} value={k}>
              {v.label}
            </option>
          ))}
        </select>
        <Button variant="outline" size="md">
          Filtrar
        </Button>
      </form>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[var(--color-border)] p-10 text-center text-sm text-[var(--color-muted)]">
          No hay cajas todavía.{" "}
          <Link href="/boxes/new" className="text-[var(--brand-primary)] underline">
            Crea la primera
          </Link>
          .
        </div>
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Código</TH>
              <TH>Tipo</TH>
              <TH>Estado</TH>
              <TH>Dirección</TH>
              <TH>Actualizado</TH>
              <TH></TH>
            </TR>
          </THead>
          <TBody>
            {rows.map((b) => (
              <TR key={b.id}>
                <TD className="font-mono text-xs">{b.code}</TD>
                <TD>
                  <Badge tone="info">{BOX_TYPE_META[b.type]?.label ?? b.type}</Badge>
                </TD>
                <TD>
                  <Badge tone={b.status === "active" ? "success" : "warning"}>{b.status}</Badge>
                </TD>
                <TD className="text-[var(--color-muted)]">{b.address ?? "—"}</TD>
                <TD className="text-xs text-[var(--color-muted)]">
                  {b.updatedAt.toISOString().slice(0, 10)}
                </TD>
                <TD className="text-right">
                  <Link
                    href={`/boxes/${b.id}`}
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
