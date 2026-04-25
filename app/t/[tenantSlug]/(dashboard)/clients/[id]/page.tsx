import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTenantContext } from "@/lib/tenancy/guards";
import { withTenantTx } from "@/lib/tenancy/context";
import { getClientById } from "@/lib/db/queries/clients";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface Props {
  params: Promise<{ id: string }>;
}

const STATUS_TONE: Record<string, "success" | "warning" | "destructive" | "neutral"> = {
  active: "success",
  pending: "warning",
  suspended: "destructive",
  cancelled: "neutral",
};

export default async function ClientDetailPage({ params }: Props) {
  const ctx = await requireTenantContext();
  if (!ctx) return null;
  const { id } = await params;

  const client = await withTenantTx(
    { userId: ctx.userId, organizationId: ctx.organizationId, impersonatedBy: ctx.impersonatedBy },
    async () => getClientById(ctx.organizationId, id),
  );

  if (!client) notFound();

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="mb-6">
        <div className="flex items-center gap-2 text-sm text-[var(--color-muted)]">
          <Link href="/clients" className="hover:underline">Clientes</Link>
          <span>/</span>
          <span>{client.name}</span>
        </div>
        <div className="mt-1 flex items-center gap-3">
          <h1 className="text-3xl font-semibold">{client.name}</h1>
          <Badge tone={STATUS_TONE[client.status] ?? "neutral"}>{client.status}</Badge>
        </div>
        <p className="mt-1 text-sm text-[var(--color-muted)]">{client.address}</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Contacto</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Código externo" value={client.externalCode ?? "—"} />
            <Row label="Documento" value={client.documentId ?? "—"} />
            <Row label="Teléfono" value={client.phone ?? "—"} />
            <Row label="Email" value={client.email ?? "—"} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Acometida</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="ONT Serial" value={client.ontSerial ?? "—"} />
            <Row label="ONT Modelo" value={client.ontModel ?? "—"} />
            <Row
              label="Fibra drop"
              value={
                client.dropCableCode && client.dropFiberNumber
                  ? `${client.dropCableCode}:${String(client.dropFiberNumber).padStart(2, "0")}`
                  : "—"
              }
            />
            <Row label="CTO destino" value={client.dropBoxCode ?? "—"} />
            <Row
              label="Instalado"
              value={client.installedAt ? String(client.installedAt) : "—"}
            />
          </CardContent>
        </Card>
      </div>

      {client.dropFiberId ? (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Impacto</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-[var(--color-muted)]">
              Si esta fibra se corta, el cliente queda sin servicio. Usa la búsqueda (cmd+K) o{" "}
              <Link
                href={`/search?kind=fiber&id=${client.dropFiberId}`}
                className="text-[var(--brand-primary)] underline"
              >
                trazar impacto desde aquí
              </Link>
              .
            </p>
          </CardContent>
        </Card>
      ) : null}

      {client.notes ? (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Notas</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="whitespace-pre-wrap text-sm">{client.notes}</pre>
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
