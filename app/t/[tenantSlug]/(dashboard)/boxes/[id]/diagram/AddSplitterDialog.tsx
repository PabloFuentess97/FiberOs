"use client";

import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { createSplitterAction } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

export function AddSplitterDialog({ boxId }: { boxId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [ratio, setRatio] = useState("1x8");
  const [loss, setLoss] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await createSplitterAction({
      boxId,
      code,
      ratio,
      insertionLossDb: loss ? Number(loss) : undefined,
    });
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setOpen(false);
    setCode("");
    setLoss("");
    start(() => router.refresh());
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus size={16} /> Añadir splitter
      </Button>
      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <form
            onSubmit={onSubmit}
            className="flex w-full max-w-md flex-col gap-4 rounded-xl bg-white p-6 shadow-lg"
          >
            <h2 className="text-lg font-semibold">Nuevo splitter</h2>
            <div className="flex flex-col gap-1">
              <Label htmlFor="code">Código</Label>
              <Input
                id="code"
                required
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="SPL-0042"
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="ratio">Ratio</Label>
              <Select id="ratio" value={ratio} onChange={(e) => setRatio(e.target.value)}>
                <option value="1x2">1x2</option>
                <option value="1x4">1x4</option>
                <option value="1x8">1x8</option>
                <option value="1x16">1x16</option>
                <option value="1x32">1x32</option>
                <option value="1x64">1x64</option>
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="loss">Pérdida inserción (dB)</Label>
              <Input
                id="loss"
                type="number"
                step="0.01"
                value={loss}
                onChange={(e) => setLoss(e.target.value)}
                placeholder="10.5"
              />
            </div>
            {error ? <p className="text-sm text-[var(--color-destructive)]">{error}</p> : null}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "Creando…" : "Crear splitter"}
              </Button>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}
