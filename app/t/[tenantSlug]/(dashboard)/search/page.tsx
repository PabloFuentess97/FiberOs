import Link from "next/link";
import { AlertTriangle, Zap } from "lucide-react";
import { requireTenantContext } from "@/lib/tenancy/guards";
import { withTenantTx } from "@/lib/tenancy/context";
import { computeImpact, type ImpactEntryKind } from "@/lib/db/queries/impact";
import { searchEntities } from "@/lib/db/queries/search";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

interface Props {
  searchParams: Promise<{
    q?: string;
    kind?: ImpactEntryKind;
    id?: string;
  }>;
}

export default async function SearchPage({ searchParams }: Props) {
  const ctx = await requireTenantContext();
  if (!ctx) return null;
  const { q, kind, id } = await searchParams;

  // Modo A: búsqueda libre por texto
  const results = q
    ? await withTenantTx(
        { userId: ctx.userId, organizationId: ctx.organizationId, impersonatedBy: ctx.impersonatedBy },
        async () => searchEntities(q, 30),
      )
    : [];

  // Modo B: trazado de impacto (explícito por ?kind=&id=)
  const impact = kind && id
    ? await withTenantTx(
        { userId: ctx.userId, organizationId: ctx.organizationId, impersonatedBy: ctx.impersonatedBy },
        async () => computeImpact({ kind, id }),
      )
    : null;

  return (
    <div className="mx-auto max-w-6xl p-6">
      <h1 className="text-2xl font-semibold">Búsqueda y trazado</h1>
      <p className="mt-1 text-sm text-[var(--color-muted)]">
        Busca cajas, cables o clientes. Para simular un corte, entra desde el detalle de un cable
        o fibra usando "Trazar impacto".
      </p>

      <form action="/search" className="mt-4 flex gap-2">
        <input
          name="q"
          defaultValue={q ?? ""}
          placeholder="Código de caja, nombre de cliente, CBL-0001:12…"
          className="h-10 flex-1 rounded-md border border-[var(--color-border)] bg-white px-3 text-sm"
        />
        <button
          type="submit"
          className="rounded-md bg-[var(--brand-primary)] px-4 text-sm font-medium text-white"
        >
          Buscar
        </button>
      </form>

      {q ? (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Resultados ({results.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {results.length === 0 ? (
              <p className="text-sm text-[var(--color-muted)]">Sin coincidencias.</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {results.map((r) => (
                  <li key={`${r.kind}:${r.id}`}>
                    <Link
                      href={r.url}
                      className="flex items-center justify-between rounded-md px-2 py-2 hover:bg-[var(--color-surface)]"
                    >
                      <span>
                        <span className="font-medium">{r.title}</span>{" "}
                        <span className="text-xs text-[var(--color-muted)]">{r.subtitle}</span>
                      </span>
                      <Badge tone="info">{r.kind}</Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      ) : null}

      {impact ? <ImpactResults impact={impact} /> : null}

      {!q && !impact ? (
        <div className="mt-6 rounded-lg border border-dashed border-[var(--color-border)] p-8 text-center text-sm text-[var(--color-muted)]">
          Empieza escribiendo una consulta o pulsa <kbd className="rounded bg-[var(--color-surface)] px-1 font-mono">⌘K</kbd>.
        </div>
      ) : null}
    </div>
  );
}

function ImpactResults({ impact }: { impact: NonNullable<Awaited<ReturnType<typeof computeImpact>>> }) {
  const severity = impact.clients.length === 0 ? "success" : "destructive";
  return (
    <>
      <Card className="mt-6 border-l-4 border-l-[var(--color-destructive)]">
        <CardHeader>
          <div className="flex items-center gap-2">
            <AlertTriangle size={18} className="text-[var(--color-destructive)]" />
            <CardTitle>Trazado de impacto</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm">
            Entrada: <span className="font-mono">{impact.input.kind}:{impact.input.id.slice(0, 8)}</span>
          </p>
          <div className="mt-3 grid grid-cols-3 gap-4">
            <div className="rounded-md bg-[var(--color-surface)] p-3 text-center">
              <div className="text-3xl font-semibold">{impact.fibers.length}</div>
              <div className="text-xs text-[var(--color-muted)]">fibras afectadas</div>
            </div>
            <div className="rounded-md bg-[var(--color-surface)] p-3 text-center">
              <div className="text-3xl font-semibold">{impact.affectedCableIds.length}</div>
              <div className="text-xs text-[var(--color-muted)]">cables afectados</div>
            </div>
            <div
              className={`rounded-md p-3 text-center ${
                severity === "destructive" ? "bg-red-50 text-[var(--color-destructive)]" : "bg-green-50 text-green-800"
              }`}
            >
              <div className="text-3xl font-semibold">{impact.clients.length}</div>
              <div className="text-xs">clientes impactados</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {impact.clients.length > 0 ? (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle>Clientes afectados</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <THead>
                <TR>
                  <TH>Nombre</TH>
                  <TH>Dirección</TH>
                  <TH>Fibra drop</TH>
                  <TH>Estado</TH>
                  <TH></TH>
                </TR>
              </THead>
              <TBody>
                {impact.clients.map((c) => (
                  <TR key={c.id}>
                    <TD className="font-medium">{c.name}</TD>
                    <TD className="text-xs text-[var(--color-muted)]">{c.address}</TD>
                    <TD className="font-mono text-xs">
                      {c.cableCode}:{String(c.fiberNumber).padStart(2, "0")}
                    </TD>
                    <TD>
                      <Badge tone={c.status === "active" ? "success" : "warning"}>{c.status}</Badge>
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
          </CardContent>
        </Card>
      ) : null}

      <Card className="mt-4">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Zap size={16} className="text-[var(--color-muted)]" />
            <CardTitle className="text-base">Fibras alcanzadas ({impact.fibers.length})</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="max-h-64 overflow-auto">
            <Table>
              <THead>
                <TR>
                  <TH>Cable</TH>
                  <TH>#</TH>
                  <TH>Color</TH>
                </TR>
              </THead>
              <TBody>
                {impact.fibers.slice(0, 200).map((f) => (
                  <TR key={f.fiberId}>
                    <TD className="font-mono text-xs">{f.cableCode}</TD>
                    <TD>{f.number}</TD>
                    <TD className="text-xs">{f.color}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            {impact.fibers.length > 200 ? (
              <p className="mt-2 text-xs text-[var(--color-muted)]">
                Mostrando 200 de {impact.fibers.length}.
              </p>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </>
  );
}
