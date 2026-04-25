"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Map as MLMap } from "maplibre-gl";
import { createCableAction } from "@/app/t/[tenantSlug]/(dashboard)/cables/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

interface Props {
  styleUrl: string;
  center: [number, number];
}

interface LatLng {
  lat: number;
  lng: number;
}

export function CableDrawClient({ styleUrl, center }: Props) {
  const router = useRouter();
  const mapRef = useRef<MLMap | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const drawRef = useRef<unknown>(null);
  const [path, setPath] = useState<LatLng[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!containerRef.current) return;

    (async () => {
      const [{ Map, NavigationControl }, maplibreCss, terra] = await Promise.all([
        import("maplibre-gl"),
        import("maplibre-gl/dist/maplibre-gl.css"),
        import("terra-draw"),
      ]);
      void maplibreCss;
      if (cancelled || !containerRef.current) return;

      const map = new Map({
        container: containerRef.current,
        style: styleUrl,
        center,
        zoom: 15,
      });
      map.addControl(new NavigationControl({}), "top-right");
      mapRef.current = map;

      // Terra Draw con adapter MapLibre.
      const { TerraDraw, TerraDrawLineStringMode } = terra as unknown as {
        TerraDraw: new (opts: Record<string, unknown>) => {
          start: () => void;
          setMode: (m: string) => void;
          on: (evt: string, cb: (...args: unknown[]) => void) => void;
          getSnapshot: () => unknown[];
        };
        TerraDrawLineStringMode: new () => unknown;
      };
      const { TerraDrawMapLibreGLAdapter } = (await import("terra-draw")) as unknown as {
        TerraDrawMapLibreGLAdapter: new (opts: { map: MLMap }) => unknown;
      };

      const draw = new TerraDraw({
        adapter: new TerraDrawMapLibreGLAdapter({ map }),
        modes: [new TerraDrawLineStringMode()],
      });
      draw.start();
      draw.setMode("linestring");
      drawRef.current = draw;

      draw.on("finish", () => {
        const snapshot = draw.getSnapshot() as Array<{
          geometry: { type: string; coordinates: [number, number][] };
        }>;
        const last = snapshot[snapshot.length - 1];
        if (!last || last.geometry.type !== "LineString") return;
        setPath(last.geometry.coordinates.map(([lng, lat]) => ({ lat, lng })));
      });
    })();

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      drawRef.current = null;
    };
  }, [styleUrl, center]);

  async function onSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (path.length < 2) {
      setError("Dibuja primero una trayectoria en el mapa (mínimo 2 puntos).");
      return;
    }
    setError(null);
    setSaving(true);
    const fd = new FormData(e.currentTarget);
    const res = await createCableAction({
      code: String(fd.get("code") ?? ""),
      type: String(fd.get("type") ?? "trunk"),
      standard: String(fd.get("standard") ?? "G657A2"),
      fiberCount: Number(fd.get("fiberCount") ?? 24),
      lengthM: fd.get("lengthM") ? Number(fd.get("lengthM")) : undefined,
      sourceBoxId: String(fd.get("sourceBoxId") ?? ""),
      targetBoxId: String(fd.get("targetBoxId") ?? ""),
      notes: "",
      path,
    });
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    router.push(`/cables/${res.cableId}`);
    router.refresh();
  }

  return (
    <div className="grid h-[calc(100vh-3.5rem)] grid-cols-[1fr_380px]">
      <div ref={containerRef} className="h-full w-full" />
      <form
        onSubmit={onSave}
        className="flex flex-col gap-3 overflow-y-auto border-l border-[var(--color-border)] bg-white p-4"
      >
        <h2 className="text-lg font-semibold">Nuevo cable</h2>
        <p className="text-xs text-[var(--color-muted)]">
          Dibuja la trayectoria clicando puntos sobre el mapa. Doble-clic termina la línea.
        </p>
        <div className="flex flex-col gap-1">
          <Label htmlFor="code">Código</Label>
          <Input id="code" name="code" required placeholder="CBL-0042" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-1">
            <Label htmlFor="type">Tipo</Label>
            <Select id="type" name="type" defaultValue="trunk">
              <option value="main_trunk">Troncal principal</option>
              <option value="trunk">Troncal</option>
              <option value="subtrunk">Subtroncal</option>
              <option value="drop">Acometida</option>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="fiberCount">Fibras</Label>
            <Input id="fiberCount" name="fiberCount" type="number" min={1} max={288} defaultValue={24} />
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="standard">Estándar</Label>
          <Select id="standard" name="standard" defaultValue="G657A2">
            <option value="G657A2">G.657.A2</option>
            <option value="G652D">G.652.D</option>
            <option value="G657A1">G.657.A1</option>
            <option value="G657B3">G.657.B3</option>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="lengthM">Longitud (m)</Label>
          <Input id="lengthM" name="lengthM" type="number" step="0.01" min={0} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="sourceBoxId">Caja origen (UUID)</Label>
          <Input id="sourceBoxId" name="sourceBoxId" />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="targetBoxId">Caja destino (UUID)</Label>
          <Input id="targetBoxId" name="targetBoxId" />
        </div>

        <div className="rounded-md bg-[var(--color-surface)] p-2 text-xs">
          Puntos dibujados: <span className="font-mono">{path.length}</span>
        </div>
        {error ? <p className="text-sm text-[var(--color-destructive)]">{error}</p> : null}
        <Button type="submit" disabled={saving || path.length < 2}>
          {saving ? "Guardando…" : "Guardar cable"}
        </Button>
      </form>
    </div>
  );
}
