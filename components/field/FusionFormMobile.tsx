"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, X, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { fieldDB, enqueue } from "@/lib/field/db";
import { flushPending } from "@/lib/field/sync";
import { canFuse, type CanFuseEndpoint } from "@/lib/network/fusion";
import { uploadCompressedPhoto } from "@/lib/field/photo";

interface FiberOption {
  id: string;
  cableId: string;
  cableCode: string;
  number: number;
  color: string;
  status: string;
}

interface PortOption {
  id: string;
  splitterId: string;
  splitterCode: string;
  portKind: "input" | "output";
  portNumber: number;
  fused: boolean;
}

type EndpointChoice =
  | { kind: "fiber"; id: string; label: string; cableId: string; alreadyFused: boolean }
  | { kind: "splitter_port"; id: string; label: string; splitterId: string; portKind: "input" | "output"; alreadyFused: boolean };

interface Props {
  boxId: string;
  onClose: () => void;
  onDone: () => void;
}

export function FusionFormMobile({ boxId, onClose, onDone }: Props) {
  const router = useRouter();
  const [fiberOpts, setFiberOpts] = useState<FiberOption[]>([]);
  const [portOpts, setPortOpts] = useState<PortOption[]>([]);
  const [a, setA] = useState<EndpointChoice | null>(null);
  const [b, setB] = useState<EndpointChoice | null>(null);
  const [lossDb, setLossDb] = useState<string>("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "uploading" | "enqueuing" | "syncing" | "done">("idle");

  // Cargar opciones de endpoints desde Dexie
  useEffect(() => {
    (async () => {
      const db = fieldDB();
      const [cables, splitters, ports] = await Promise.all([
        db.cables.filter((c) => c.sourceBoxId === boxId || c.targetBoxId === boxId).toArray(),
        db.splitters.where("boxId").equals(boxId).toArray(),
        (async () => {
          const sps = await db.splitters.where("boxId").equals(boxId).toArray();
          const ids = sps.map((s) => s.id);
          if (ids.length === 0) return [];
          return db.splitterPorts.where("splitterId").anyOf(ids).toArray();
        })(),
      ]);

      const cableIds = cables.map((c) => c.id);
      const fibers = cableIds.length === 0
        ? []
        : await db.fibers.where("cableId").anyOf(cableIds).sortBy("number");
      const cableByFiber = new Map(cables.map((c) => [c.id, c]));

      setFiberOpts(
        fibers.map((f) => ({
          id: f.id,
          cableId: f.cableId,
          cableCode: cableByFiber.get(f.cableId)?.code ?? "?",
          number: f.number,
          color: f.color,
          status: f.status,
        })),
      );

      const splitterByPort = new Map(splitters.map((s) => [s.id, s]));
      setPortOpts(
        ports.map((p) => ({
          id: p.id,
          splitterId: p.splitterId,
          splitterCode: splitterByPort.get(p.splitterId)?.code ?? "?",
          portKind: p.kind,
          portNumber: p.portNumber,
          fused: p.fused,
        })),
      );
    })();
  }, [boxId]);

  function parseEndpointValue(v: string): EndpointChoice | null {
    if (!v) return null;
    const [kind, id] = v.split(":");
    if (kind === "fiber") {
      const f = fiberOpts.find((x) => x.id === id);
      if (!f) return null;
      return {
        kind: "fiber",
        id: f.id,
        label: `${f.cableCode}:${String(f.number).padStart(2, "0")} (${f.color})`,
        cableId: f.cableId,
        alreadyFused: f.status === "fused",
      };
    }
    if (kind === "port") {
      const p = portOpts.find((x) => x.id === id);
      if (!p) return null;
      return {
        kind: "splitter_port",
        id: p.id,
        label: `${p.splitterCode} ${p.portKind}${p.portKind === "output" ? ` ${p.portNumber}` : ""}`,
        splitterId: p.splitterId,
        portKind: p.portKind,
        alreadyFused: p.fused,
      };
    }
    return null;
  }

  const localCheck =
    a && b
      ? canFuse(
          toCanFuse(a, boxId),
          toCanFuse(b, boxId),
        )
      : null;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!a || !b) return;
    if (localCheck && !localCheck.ok) {
      setError(localCheck.message ?? "Combinación inválida");
      return;
    }
    setError(null);
    setSubmitting(true);

    try {
      let photoFileId: string | undefined;
      if (photo) {
        setStatus("uploading");
        if (!navigator.onLine) {
          setError("Sin conexión: la foto se subirá al recuperar red. Guardando fusión sin ella por ahora.");
          photoFileId = undefined;
        } else {
          const r = await uploadCompressedPhoto(photo, { table: "fusions", id: crypto.randomUUID() });
          photoFileId = r.fileId;
        }
      }

      setStatus("enqueuing");
      await enqueue({
        entity: "fusion",
        op: "create",
        clientVersion: null,
        payload: {
          boxId,
          endpointA: { kind: a.kind, id: a.id },
          endpointB: { kind: b.kind, id: b.id },
          lossDb: lossDb ? Number(lossDb) : undefined,
          photoFileId,
        },
      });

      if (navigator.onLine) {
        setStatus("syncing");
        await flushPending();
      }
      setStatus("done");
      setTimeout(() => {
        onDone();
        router.refresh();
      }, 400);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-30 flex flex-col bg-white">
      <header className="flex h-12 items-center justify-between border-b border-[var(--color-border)] px-3">
        <h2 className="text-base font-semibold">Nueva fusión</h2>
        <button type="button" onClick={onClose} className="p-2">
          <X size={20} />
        </button>
      </header>

      <form onSubmit={onSubmit} className="flex-1 overflow-y-auto p-4">
        <div className="flex flex-col gap-4">
          <div>
            <Label htmlFor="ep-a">Extremo A</Label>
            <Select
              id="ep-a"
              onChange={(e) => setA(parseEndpointValue(e.target.value))}
              defaultValue=""
              className="h-11 text-base"
            >
              <option value="">Selecciona…</option>
              <optgroup label="Fibras">
                {fiberOpts.map((f) => (
                  <option
                    key={f.id}
                    value={`fiber:${f.id}`}
                    disabled={f.status === "fused"}
                  >
                    {f.cableCode}:{String(f.number).padStart(2, "0")} · {f.color}
                    {f.status === "fused" ? " (ocupada)" : ""}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Puertos de splitter">
                {portOpts.map((p) => (
                  <option key={p.id} value={`port:${p.id}`} disabled={p.fused}>
                    {p.splitterCode} · {p.portKind}
                    {p.portKind === "output" ? ` ${p.portNumber}` : ""}
                    {p.fused ? " (ocupado)" : ""}
                  </option>
                ))}
              </optgroup>
            </Select>
          </div>

          <div>
            <Label htmlFor="ep-b">Extremo B</Label>
            <Select
              id="ep-b"
              onChange={(e) => setB(parseEndpointValue(e.target.value))}
              defaultValue=""
              className="h-11 text-base"
            >
              <option value="">Selecciona…</option>
              <optgroup label="Fibras">
                {fiberOpts.map((f) => (
                  <option key={f.id} value={`fiber:${f.id}`} disabled={f.status === "fused"}>
                    {f.cableCode}:{String(f.number).padStart(2, "0")} · {f.color}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Puertos de splitter">
                {portOpts.map((p) => (
                  <option key={p.id} value={`port:${p.id}`} disabled={p.fused}>
                    {p.splitterCode} · {p.portKind}
                    {p.portKind === "output" ? ` ${p.portNumber}` : ""}
                  </option>
                ))}
              </optgroup>
            </Select>
          </div>

          {localCheck && !localCheck.ok ? (
            <div className="rounded-md bg-red-100 px-3 py-2 text-sm text-red-900">
              {localCheck.message}
            </div>
          ) : null}
          {localCheck && localCheck.ok && localCheck.warning ? (
            <div className="rounded-md bg-amber-100 px-3 py-2 text-sm text-amber-900">
              ⚠ {localCheck.message}
            </div>
          ) : null}

          <div>
            <Label htmlFor="lossDb">Pérdida (dB)</Label>
            <Input
              id="lossDb"
              type="number"
              step="0.01"
              min={0}
              max={10}
              inputMode="decimal"
              value={lossDb}
              onChange={(e) => setLossDb(e.target.value)}
              placeholder="0.15"
              className="h-11 text-base"
            />
          </div>

          <div>
            <Label htmlFor="photo">Foto de la fusión</Label>
            <label
              htmlFor="photo"
              className="mt-1 flex h-20 cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-[var(--color-border)] text-sm text-[var(--color-muted)]"
            >
              <Camera size={20} />
              {photo ? photo.name : "Toma una foto (se comprime a 1600px WebP)"}
            </label>
            <input
              id="photo"
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
            />
          </div>

          {error ? <p className="text-sm text-[var(--color-destructive)]">{error}</p> : null}
          {status !== "idle" && status !== "done" ? (
            <p className="text-sm text-[var(--color-muted)]">
              {status === "uploading"
                ? "Subiendo foto…"
                : status === "enqueuing"
                  ? "Guardando localmente…"
                  : "Sincronizando con servidor…"}
            </p>
          ) : null}
          {status === "done" ? (
            <p className="flex items-center gap-1 text-sm text-green-700">
              <CheckCircle2 size={14} /> Fusión registrada.
            </p>
          ) : null}

          <Button
            type="submit"
            disabled={!a || !b || submitting || Boolean(localCheck && !localCheck.ok)}
            size="lg"
            className="h-12"
          >
            {submitting ? "Guardando…" : "Registrar fusión"}
          </Button>
        </div>
      </form>
    </div>
  );
}

function toCanFuse(e: EndpointChoice, boxId: string): CanFuseEndpoint {
  if (e.kind === "fiber") {
    return {
      kind: "fiber",
      fiberId: e.id,
      organizationId: "",
      boxId,
      cableId: e.cableId,
      alreadyFused: e.alreadyFused,
    };
  }
  return {
    kind: "splitter_port",
    portId: e.id,
    organizationId: "",
    boxId,
    splitterId: e.splitterId,
    portKind: e.portKind,
    alreadyFused: e.alreadyFused,
  };
}
