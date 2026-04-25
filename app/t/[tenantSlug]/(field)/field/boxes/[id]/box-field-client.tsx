"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, MapPin, AlertTriangle } from "lucide-react";
import { fieldDB, type FieldBox, type FieldCable, type FieldSplitter, type FieldFusion } from "@/lib/field/db";
import { FusionFormMobile } from "@/components/field/FusionFormMobile";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export function BoxFieldClient({ boxId }: { boxId: string }) {
  const [box, setBox] = useState<FieldBox | null>(null);
  const [cables, setCables] = useState<FieldCable[]>([]);
  const [splitters, setSplitters] = useState<FieldSplitter[]>([]);
  const [fusions, setFusions] = useState<FieldFusion[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [missing, setMissing] = useState(false);

  async function load() {
    const db = fieldDB();
    const b = await db.boxes.get(boxId);
    if (!b) {
      setMissing(true);
      return;
    }
    setBox(b);
    const [cs, ss, fs] = await Promise.all([
      db.cables.filter((c) => c.sourceBoxId === boxId || c.targetBoxId === boxId).toArray(),
      db.splitters.where("boxId").equals(boxId).toArray(),
      db.fusions.where("boxId").equals(boxId).toArray(),
    ]);
    setCables(cs);
    setSplitters(ss);
    setFusions(fs);
  }

  useEffect(() => {
    load();
  }, [boxId]);

  if (missing) {
    return (
      <div className="p-4">
        <div className="flex items-start gap-2 rounded-md bg-amber-100 p-3 text-sm text-amber-900">
          <AlertTriangle size={16} className="mt-0.5" />
          <div>
            Esta caja no está en tu inventario local. Ve al{" "}
            <Link href="/field" className="underline">
              inicio
            </Link>{" "}
            y pulsa <strong>Descargar cercanos</strong>.
          </div>
        </div>
      </div>
    );
  }

  if (!box) {
    return <div className="p-4 text-sm text-[var(--color-muted)]">Cargando…</div>;
  }

  return (
    <div className="p-4 pb-24">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs text-[var(--color-muted)]">
            <Link href="/field" className="hover:underline">Campo</Link>
            <span>/</span>
            <span className="font-mono">{box.shortId}</span>
          </div>
          <h1 className="mt-1 text-2xl font-semibold">{box.code}</h1>
          <p className="mt-1 flex items-center gap-1 text-sm text-[var(--color-muted)]">
            <Badge tone="info">{box.type}</Badge>
            <Badge tone={box.status === "active" ? "success" : "warning"}>{box.status}</Badge>
          </p>
          {box.address ? (
            <p className="mt-2 flex items-center gap-1 text-sm">
              <MapPin size={14} className="text-[var(--color-muted)]" />
              {box.address}
            </p>
          ) : null}
        </div>
      </div>

      <section className="mt-6 space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-muted)]">
          Cables ({cables.length})
        </h2>
        {cables.map((c) => {
          const direction = c.sourceBoxId === boxId ? "→ sale" : "← entra";
          return (
            <div
              key={c.id}
              className="flex items-center justify-between rounded-md border border-[var(--color-border)] bg-white p-3"
            >
              <div>
                <div className="font-mono text-sm">{c.code}</div>
                <div className="text-xs text-[var(--color-muted)]">
                  {c.type} · {c.fiberCount} fibras · {direction}
                </div>
              </div>
            </div>
          );
        })}
      </section>

      <section className="mt-6 space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-muted)]">
          Splitters ({splitters.length})
        </h2>
        {splitters.map((s) => (
          <div
            key={s.id}
            className="flex items-center justify-between rounded-md border border-[var(--color-border)] bg-white p-3"
          >
            <div className="font-mono text-sm">{s.code}</div>
            <Badge>{s.ratio}</Badge>
          </div>
        ))}
      </section>

      <section className="mt-6 space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-muted)]">
          Fusiones ({fusions.length})
        </h2>
        {fusions.length === 0 ? (
          <p className="text-xs text-[var(--color-muted)]">Sin fusiones registradas en local.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {fusions.map((f) => (
              <li
                key={f.id}
                className="rounded-md border border-[var(--color-border)] bg-white px-3 py-2 font-mono text-xs"
              >
                {f.endpointAKind} {f.endpointAId.slice(0, 6)} ↔ {f.endpointBKind}{" "}
                {f.endpointBId.slice(0, 6)}
                {f.lossDb ? ` · ${f.lossDb} dB` : ""}
              </li>
            ))}
          </ul>
        )}
      </section>

      <Button
        onClick={() => setShowForm(true)}
        size="lg"
        className="fixed bottom-20 right-4 h-14 rounded-full shadow-lg"
      >
        <Plus size={22} /> Añadir fusión
      </Button>

      {showForm ? (
        <FusionFormMobile
          boxId={boxId}
          onClose={() => setShowForm(false)}
          onDone={() => {
            setShowForm(false);
            load();
          }}
        />
      ) : null}
    </div>
  );
}
