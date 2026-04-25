import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { requireTenantContext } from "@/lib/tenancy/guards";
import { withTenantTx } from "@/lib/tenancy/context";
import { getCableById } from "@/lib/db/queries/cables";
import { FIBER_HEX } from "@/lib/geo/colors";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function CableDetailPage({ params }: Props) {
  const ctx = await requireTenantContext();
  if (!ctx) return null;
  const { id } = await params;

  const cable = await withTenantTx(
    { userId: ctx.userId, organizationId: ctx.organizationId, impersonatedBy: ctx.impersonatedBy },
    async () => getCableById(ctx.organizationId, id),
  );

  if (!cable) notFound();

  const fiberStatusTone = (s: string) =>
    s === "free" ? "success" : s === "fused" ? "info" : s === "reserved" ? "warning" : "destructive";

  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="mb-6">
        <div className="flex items-center gap-2 text-sm text-[var(--color-muted)]">
          <Link href="/cables" className="hover:underline">
            Cables
          </Link>
          <span>/</span>
          <span>{cable.code}</span>
        </div>
        <div className="mt-1 flex items-center justify-between">
          <h1 className="text-3xl font-semibold">{cable.code}</h1>
          <Button asChild variant="outline">
            <Link href={`/search?kind=cable&id=${cable.id}`}>
              <AlertTriangle size={16} /> Trazar impacto
            </Link>
          </Button>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <Badge tone="info">{cable.type}</Badge>
          <Badge>{cable.standard}</Badge>
          <span className="text-xs text-[var(--color-muted)]">
            {cable.fiberCount} fibras · {cable.lengthM ? `${cable.lengthM} m` : "longitud no medida"}
          </span>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Datos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between border-b border-[var(--color-border)]/60 py-1">
              <span className="text-[var(--color-muted)]">Origen (box)</span>
              <span className="font-medium">{cable.sourceBoxId ?? "—"}</span>
            </div>
            <div className="flex justify-between border-b border-[var(--color-border)]/60 py-1">
              <span className="text-[var(--color-muted)]">Destino (box)</span>
              <span className="font-medium">{cable.targetBoxId ?? "—"}</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-[var(--color-muted)]">Instalado</span>
              <span className="font-medium">{cable.installedAt ? String(cable.installedAt) : "—"}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Trazado</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex h-40 items-center justify-center rounded-md border border-dashed border-[var(--color-border)] text-center text-sm text-[var(--color-muted)]">
              Mini-mapa con terra-draw — Sprint 2 (vista) / Sprint 3 (edición)
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Fibras</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <THead>
              <TR>
                <TH>#</TH>
                <TH>Color</TH>
                <TH>Estado</TH>
                <TH>Notas</TH>
              </TR>
            </THead>
            <TBody>
              {cable.fibers.map((f) => (
                <TR key={f.id}>
                  <TD>{f.number}</TD>
                  <TD>
                    <div className="flex items-center gap-2">
                      <span
                        className="inline-block h-3 w-3 rounded-full border border-[var(--color-border)]"
                        style={{ background: FIBER_HEX[f.color] }}
                        aria-hidden
                      />
                      <span className="text-xs">{f.color}</span>
                    </div>
                  </TD>
                  <TD>
                    <Badge tone={fiberStatusTone(f.status)}>{f.status}</Badge>
                  </TD>
                  <TD className="text-xs text-[var(--color-muted)]">{f.notes ?? ""}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
