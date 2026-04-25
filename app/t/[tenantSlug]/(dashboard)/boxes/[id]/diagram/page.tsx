import Link from "next/link";
import { notFound } from "next/navigation";
import { Plus } from "lucide-react";
import { requireTenantContext } from "@/lib/tenancy/guards";
import { withTenantTx } from "@/lib/tenancy/context";
import { getBoxById } from "@/lib/db/queries/boxes";
import { getInternalDiagram } from "@/lib/db/queries/diagram";
import { InternalDiagram } from "@/components/box/InternalDiagram";
import { AddSplitterDialog } from "./AddSplitterDialog";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function BoxDiagramPage({ params }: Props) {
  const ctx = await requireTenantContext();
  if (!ctx) return null;
  const { id } = await params;

  const [box, diagram] = await withTenantTx(
    { userId: ctx.userId, organizationId: ctx.organizationId, impersonatedBy: ctx.impersonatedBy },
    async () => Promise.all([getBoxById(ctx.organizationId, id), getInternalDiagram(ctx.organizationId, id)]),
  );

  if (!box || !diagram) notFound();

  const canEdit = ["admin", "manager", "technician"].includes(ctx.role);

  const totalPorts = diagram.splitters.reduce((s, sp) => s + sp.ports.length, 0);
  const totalFibers = diagram.cableEnds.reduce((s, c) => s + c.fibers.length, 0);

  return (
    <div className="mx-auto flex h-full max-w-[1600px] flex-col p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm text-[var(--color-muted)]">
            <Link href="/boxes" className="hover:underline">Cajas</Link>
            <span>/</span>
            <Link href={`/boxes/${box.id}`} className="hover:underline">
              {box.code}
            </Link>
            <span>/</span>
            <span>Diagrama</span>
          </div>
          <h1 className="mt-1 text-2xl font-semibold">Interior de {box.code}</h1>
          <p className="text-sm text-[var(--color-muted)]">
            {diagram.splitters.length} splitters · {totalPorts} puertos · {totalFibers} fibras en cables · {diagram.fusions.length} fusiones
          </p>
        </div>
        {canEdit ? <AddSplitterDialog boxId={box.id} /> : null}
      </div>

      <InternalDiagram
        boxId={box.id}
        organizationId={ctx.organizationId}
        diagram={diagram}
        canEdit={canEdit}
      />

      <p className="mt-3 text-xs text-[var(--color-muted)]">
        Tip: en modo editar, arrastra desde un handle a otro para crear una fusión. Click sobre una
        línea existente para eliminarla.
      </p>
      {totalFibers > 144 ? (
        <p className="mt-1 text-xs text-amber-700">
          ⚠ Este cable supera 144 fibras; la virtualización por buffer/tubo se añade en Sprint 4.
        </p>
      ) : null}
    </div>
  );
}
