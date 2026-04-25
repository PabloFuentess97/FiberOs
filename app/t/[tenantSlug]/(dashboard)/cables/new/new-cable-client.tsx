"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createCableAction } from "../actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";

export function NewCableClient() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const startLat = Number(fd.get("startLat"));
    const startLng = Number(fd.get("startLng"));
    const endLat = Number(fd.get("endLat"));
    const endLng = Number(fd.get("endLng"));

    const payload = {
      code: String(fd.get("code") ?? ""),
      type: String(fd.get("type") ?? "trunk"),
      standard: String(fd.get("standard") ?? "G657A2"),
      fiberCount: Number(fd.get("fiberCount") ?? 24),
      lengthM: fd.get("lengthM") ? Number(fd.get("lengthM")) : undefined,
      sourceBoxId: String(fd.get("sourceBoxId") ?? ""),
      targetBoxId: String(fd.get("targetBoxId") ?? ""),
      notes: String(fd.get("notes") ?? ""),
      path: [
        { lat: startLat, lng: startLng },
        { lat: endLat, lng: endLng },
      ],
    };

    start(async () => {
      const res = await createCableAction(payload);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.push(`/cables/${res.cableId}`);
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <div className="flex flex-col gap-1">
        <Label htmlFor="code">Código</Label>
        <Input id="code" name="code" required placeholder="CBL-0042" />
      </div>
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
        <Label htmlFor="fiberCount">Nº de fibras</Label>
        <Input id="fiberCount" name="fiberCount" type="number" min={1} max={288} defaultValue={24} required />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="standard">Estándar</Label>
        <Select id="standard" name="standard" defaultValue="G657A2">
          <option value="G652D">G.652.D</option>
          <option value="G657A1">G.657.A1</option>
          <option value="G657A2">G.657.A2</option>
          <option value="G657B3">G.657.B3</option>
          <option value="G655">G.655</option>
        </Select>
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="lengthM">Longitud (m)</Label>
        <Input id="lengthM" name="lengthM" type="number" step="0.01" min={0} />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="sourceBoxId">Caja origen (UUID)</Label>
        <Input id="sourceBoxId" name="sourceBoxId" placeholder="(opcional)" />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="targetBoxId">Caja destino (UUID)</Label>
        <Input id="targetBoxId" name="targetBoxId" placeholder="(opcional)" />
      </div>

      <div className="md:col-span-2 grid grid-cols-2 gap-4 rounded-md bg-[var(--color-surface)] p-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor="startLat">Lat inicio</Label>
          <Input id="startLat" name="startLat" type="number" step="any" required />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="startLng">Lng inicio</Label>
          <Input id="startLng" name="startLng" type="number" step="any" required />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="endLat">Lat fin</Label>
          <Input id="endLat" name="endLat" type="number" step="any" required />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="endLng">Lng fin</Label>
          <Input id="endLng" name="endLng" type="number" step="any" required />
        </div>
      </div>

      <div className="flex flex-col gap-1 md:col-span-2">
        <Label htmlFor="notes">Notas</Label>
        <textarea
          id="notes"
          name="notes"
          rows={2}
          className="w-full rounded-md border border-[var(--color-border)] bg-white px-3 py-2 text-sm"
        />
      </div>

      {error ? <p className="md:col-span-2 text-sm text-[var(--color-destructive)]">{error}</p> : null}
      <div className="flex justify-end md:col-span-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Creando…" : "Crear cable + autogenerar fibras"}
        </Button>
      </div>
    </form>
  );
}
