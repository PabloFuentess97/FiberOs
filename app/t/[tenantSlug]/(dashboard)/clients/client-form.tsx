"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClientAction, type ClientFormState } from "./actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";

const INITIAL: ClientFormState = {};

export function ClientForm() {
  const router = useRouter();
  const [state, action, pending] = useActionState(createClientAction, INITIAL);

  useEffect(() => {
    if (state.clientId && !state.error) {
      router.push(`/clients/${state.clientId}`);
      router.refresh();
    }
  }, [state, router]);

  return (
    <form action={action} className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <div className="flex flex-col gap-1 md:col-span-2">
        <Label htmlFor="name">Nombre</Label>
        <Input id="name" name="name" required minLength={2} placeholder="Juan Pérez" />
        {state.fieldErrors?.name ? (
          <span className="text-xs text-[var(--color-destructive)]">{state.fieldErrors.name[0]}</span>
        ) : null}
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor="externalCode">Código externo</Label>
        <Input id="externalCode" name="externalCode" placeholder="CLI-0001" />
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor="documentId">Documento (DNI/NIF)</Label>
        <Input id="documentId" name="documentId" />
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor="phone">Teléfono</Label>
        <Input id="phone" name="phone" type="tel" />
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" />
      </div>

      <div className="flex flex-col gap-1 md:col-span-2">
        <Label htmlFor="address">Dirección</Label>
        <Input id="address" name="address" required />
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor="lat">Latitud</Label>
        <Input id="lat" name="lat" type="number" step="any" />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="lng">Longitud</Label>
        <Input id="lng" name="lng" type="number" step="any" />
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor="ontSerial">Serial ONT</Label>
        <Input id="ontSerial" name="ontSerial" placeholder="HWTC1234AB" />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="ontModel">Modelo ONT</Label>
        <Input id="ontModel" name="ontModel" placeholder="Huawei EG8145V5" />
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor="dropFiberId">Fibra drop (UUID)</Label>
        <Input
          id="dropFiberId"
          name="dropFiberId"
          placeholder="Busca cable:N y copia el ID"
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="status">Estado</Label>
        <Select id="status" name="status" defaultValue="pending">
          <option value="pending">Pendiente</option>
          <option value="active">Activo</option>
          <option value="suspended">Suspendido</option>
          <option value="cancelled">Cancelado</option>
        </Select>
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor="installedAt">Fecha instalación</Label>
        <Input id="installedAt" name="installedAt" type="date" />
      </div>

      <div className="flex flex-col gap-1 md:col-span-2">
        <Label htmlFor="notes">Notas</Label>
        <textarea
          id="notes"
          name="notes"
          rows={3}
          className="w-full rounded-md border border-[var(--color-border)] bg-white px-3 py-2 text-sm"
        />
      </div>

      {state.error && state.error !== "validation_error" ? (
        <p className="md:col-span-2 text-sm text-[var(--color-destructive)]">{state.error}</p>
      ) : null}

      <div className="flex justify-end gap-2 md:col-span-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Guardando…" : "Crear cliente"}
        </Button>
      </div>
    </form>
  );
}
