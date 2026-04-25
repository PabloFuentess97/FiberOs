"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { createBoxAction, updateBoxAction, type CreateBoxState } from "./actions";
import { BOX_TYPE_META } from "@/lib/geo/markers";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";

const INITIAL: CreateBoxState = {};

interface Props {
  preset?: {
    id?: string;
    code?: string;
    type?: string;
    status?: string;
    manufacturer?: string;
    model?: string;
    positionsPerTray?: number;
    address?: string;
    notes?: string;
    lat?: number;
    lng?: number;
  };
}

export function BoxForm({ preset }: Props) {
  const router = useRouter();
  const isEdit = !!preset?.id;
  const [state, action, pending] = useActionState(
    isEdit ? updateBoxAction : createBoxAction,
    INITIAL,
  );

  useEffect(() => {
    if (state.boxId && !state.error) {
      router.push(`/boxes/${state.boxId}`);
      router.refresh();
    }
  }, [state, router]);

  return (
    <form action={action} className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {isEdit ? <input type="hidden" name="id" value={preset?.id} /> : null}

      <div className="flex flex-col gap-1 md:col-span-1">
        <Label htmlFor="code">Código</Label>
        <Input
          id="code"
          name="code"
          required
          minLength={2}
          defaultValue={preset?.code}
          placeholder="CTO-0042"
        />
        {state.fieldErrors?.code ? (
          <span className="text-xs text-[var(--color-destructive)]">{state.fieldErrors.code[0]}</span>
        ) : null}
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor="type">Tipo</Label>
        <Select id="type" name="type" required defaultValue={preset?.type ?? "cto"}>
          {Object.entries(BOX_TYPE_META).map(([k, v]) => (
            <option key={k} value={k}>
              {v.label}
            </option>
          ))}
        </Select>
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor="status">Estado</Label>
        <Select id="status" name="status" defaultValue={preset?.status ?? "active"}>
          <option value="active">Activa</option>
          <option value="planned">Planificada</option>
          <option value="damaged">Dañada</option>
          <option value="decommissioned">Retirada</option>
        </Select>
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor="positionsPerTray">Posiciones por bandeja</Label>
        <Input
          id="positionsPerTray"
          name="positionsPerTray"
          type="number"
          min={1}
          max={144}
          defaultValue={preset?.positionsPerTray ?? 12}
        />
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor="manufacturer">Fabricante</Label>
        <Input
          id="manufacturer"
          name="manufacturer"
          defaultValue={preset?.manufacturer ?? ""}
          placeholder="Huawei, Televés…"
        />
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor="model">Modelo</Label>
        <Input id="model" name="model" defaultValue={preset?.model ?? ""} />
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor="lat">Latitud</Label>
        <Input
          id="lat"
          name="lat"
          type="number"
          step="any"
          required
          defaultValue={preset?.lat ?? ""}
          placeholder="37.1773"
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="lng">Longitud</Label>
        <Input
          id="lng"
          name="lng"
          type="number"
          step="any"
          required
          defaultValue={preset?.lng ?? ""}
          placeholder="-3.5986"
        />
      </div>

      <div className="flex flex-col gap-1 md:col-span-2">
        <Label htmlFor="address">Dirección</Label>
        <Input id="address" name="address" defaultValue={preset?.address ?? ""} />
      </div>

      <div className="flex flex-col gap-1 md:col-span-2">
        <Label htmlFor="notes">Notas</Label>
        <textarea
          id="notes"
          name="notes"
          rows={3}
          defaultValue={preset?.notes ?? ""}
          className="w-full rounded-md border border-[var(--color-border)] bg-white px-3 py-2 text-sm"
        />
      </div>

      {state.error && state.error !== "validation_error" ? (
        <p className="md:col-span-2 text-sm text-[var(--color-destructive)]">{state.error}</p>
      ) : null}

      <div className="flex justify-end gap-2 md:col-span-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Guardando…" : isEdit ? "Guardar cambios" : "Crear caja"}
        </Button>
      </div>
    </form>
  );
}
