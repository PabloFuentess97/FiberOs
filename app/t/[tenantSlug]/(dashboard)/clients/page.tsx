import Link from "next/link";
import { Plus } from "lucide-react";
import { requireTenantContext } from "@/lib/tenancy/guards";
import { withTenantTx } from "@/lib/tenancy/context";
import { listClients } from "@/lib/db/queries/clients";
import { Button } from "@/components/ui/button";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

interface Props {
  searchParams: Promise<{ search?: string; status?: string }>;
}

const STATUS_TONE: Record<string, "success" | "warning" | "destructive" | "neutral"> = {
  active: "success",
  pending: "warning",
  suspended: "destructive",
  cancelled: "neutral",
};

export default async function ClientsListPage({ searchParams }: Props) {
  const ctx = await requireTenantContext();
  if (!ctx) return null;
  const sp = await searchParams;

  const { rows } = await withTenantTx(
    { userId: ctx.userId, organizationId: ctx.organizationId, impersonatedBy: ctx.impersonatedBy },
    async () => listClients(ctx.organizationId, { search: sp.search, status: sp.status as never }),
  );

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Clientes</h1>
          <p className="text-sm text-[var(--color-muted)]">
            Usuarios finales con acometida activa, ONT asignada y fibra de drop.
          </p>
        </div>
        <Button asChild>
          <Link href="/clients/new" className="inline-flex items-center gap-2">
            <Plus size={16} /> Añadir cliente
          </Link>
        </Button>
      </div>

      <form className="mb-4 flex gap-2" action="/clients">
        <input
          name="search"
          type="text"
          defaultValue={sp.search ?? ""}
          placeholder="Nombre, DNI, teléfono, código…"
          className="h-9 flex-1 rounded-md border border-[var(--color-border)] bg-white px-3 text-sm"
        />
        <select
          name="status"
          defaultValue={sp.status ?? ""}
          className="h-9 rounded-md border border-[var(--color-border)] bg-white px-3 text-sm"
        >
          <option value="">Todos los estados</option>
          <option value="active">Activo</option>
          <option value="pending">Pendiente</option>
          <option value="suspended">Suspendido</option>
          <option value="cancelled">Cancelado</option>
        </select>
        <Button variant="outline">Filtrar</Button>
      </form>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[var(--color-border)] p-10 text-center text-sm text-[var(--color-muted)]">
          No hay clientes.{" "}
          <Link href="/clients/new" className="text-[var(--brand-primary)] underline">
            Añade el primero
          </Link>
          .
        </div>
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Nombre</TH>
              <TH>Código ext.</TH>
              <TH>Dirección</TH>
              <TH>Teléfono</TH>
              <TH>ONT</TH>
              <TH>Drop</TH>
              <TH>Estado</TH>
              <TH></TH>
            </TR>
          </THead>
          <TBody>
            {rows.map((c) => (
              <TR key={c.id}>
                <TD className="font-medium">{c.name}</TD>
                <TD className="font-mono text-xs">{c.externalCode ?? "—"}</TD>
                <TD className="text-xs text-[var(--color-muted)]">{c.address}</TD>
                <TD className="text-xs">{c.phone ?? "—"}</TD>
                <TD className="font-mono text-xs">{c.ontSerial ?? "—"}</TD>
                <TD className="text-xs text-[var(--color-muted)]">
                  {c.dropFiberCableCode ?? "—"}
                </TD>
                <TD>
                  <Badge tone={STATUS_TONE[c.status] ?? "neutral"}>{c.status}</Badge>
                </TD>
                <TD className="text-right">
                  <Link
                    href={`/clients/${c.id}`}
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
