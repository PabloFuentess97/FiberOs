import Link from "next/link";
import { notFound } from "next/navigation";
import { Download, QrCode } from "lucide-react";
import { requireTenantContext } from "@/lib/tenancy/guards";
import { withTenantTx } from "@/lib/tenancy/context";
import { getBoxById } from "@/lib/db/queries/boxes";
import { BOX_TYPE_META } from "@/lib/geo/markers";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { BoxForm } from "../box-form";

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ edit?: string }>;
}

export default async function BoxDetailPage({ params, searchParams }: Props) {
  const ctx = await requireTenantContext();
  if (!ctx) return null;
  const { id } = await params;
  const { edit } = await searchParams;

  const box = await withTenantTx(
    { userId: ctx.userId, organizationId: ctx.organizationId, impersonatedBy: ctx.impersonatedBy },
    async () => getBoxById(ctx.organizationId, id),
  );

  if (!box) notFound();

  const meta = BOX_TYPE_META[box.type];

  if (edit) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <h1 className="mb-4 text-2xl font-semibold">Editar caja {box.code}</h1>
        <Card>
          <CardContent className="pt-6">
            <BoxForm
              preset={{
                id: box.id,
                code: box.code,
                type: box.type,
                status: box.status,
                manufacturer: box.manufacturer ?? "",
                model: box.model ?? "",
                positionsPerTray: box.positionsPerTray,
                address: box.address ?? "",
                notes: box.notes ?? "",
                lat: box.lat,
                lng: box.lng,
              }}
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm text-[var(--color-muted)]">
            <Link href="/boxes" className="hover:underline">
              Cajas
            </Link>
            <span>/</span>
            <span>{box.code}</span>
          </div>
          <h1 className="mt-1 text-3xl font-semibold">{box.code}</h1>
          <div className="mt-2 flex items-center gap-2">
            <Badge tone="info">{meta?.label}</Badge>
            <Badge tone={box.status === "active" ? "success" : "warning"}>{box.status}</Badge>
            <span className="text-xs text-[var(--color-muted)]">short_id: {box.shortId}</span>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <a href={`/api/labels/${box.id}?format=A4`} target="_blank" rel="noreferrer">
              <Download size={16} /> Etiqueta PDF
            </a>
          </Button>
          <Button variant="outline" asChild>
            <a href={`/api/qr/${box.shortId}`} target="_blank" rel="noreferrer">
              <QrCode size={16} /> QR
            </a>
          </Button>
          <Button asChild>
            <Link href={`/boxes/${box.id}?edit=1`}>Editar</Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>General</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Fabricante" value={box.manufacturer ?? "—"} />
            <Row label="Modelo" value={box.model ?? "—"} />
            <Row label="Posiciones/bandeja" value={String(box.positionsPerTray)} />
            <Row label="Dirección" value={box.address ?? "—"} />
            <Row label="Coordenadas" value={`${box.lat.toFixed(6)}, ${box.lng.toFixed(6)}`} />
            <Row
              label="Instalada"
              value={box.installedAt ? String(box.installedAt) : "—"}
            />
            <Row label="Versión" value={String(box.version)} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Diagrama interior</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-[var(--color-muted)]">
              Vista y edición de splitters, bandejas y fusiones dentro de la caja.
            </p>
            <Button asChild className="mt-3">
              <Link href={`/boxes/${box.id}/diagram`}>Abrir diagrama</Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      {box.notes ? (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Notas</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="whitespace-pre-wrap text-sm">{box.notes}</pre>
          </CardContent>
        </Card>
      ) : null}
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
