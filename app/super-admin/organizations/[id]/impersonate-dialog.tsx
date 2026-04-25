"use client";

import { useState } from "react";
import { Eye } from "lucide-react";
import { startImpersonationAction } from "./actions";
import { Button } from "@/components/ui/button";

interface Props {
  targetUserId: string;
  targetEmail: string;
  organizationId: string;
}

export function ImpersonateDialog({ targetUserId, targetEmail, organizationId }: Props) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Eye size={12} /> Impersonar
      </Button>
      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <form
            action={startImpersonationAction}
            className="flex w-full max-w-md flex-col gap-4 rounded-xl bg-white p-6 shadow-lg"
          >
            <h2 className="text-lg font-semibold">Impersonar {targetEmail}</h2>
            <p className="text-sm text-[var(--color-muted)]">
              El usuario recibirá un email notificando el acceso. Duración máxima 2 horas.
              Todos los cambios quedarán marcados con <code>acted_as_by</code>.
            </p>
            <input type="hidden" name="targetUserId" value={targetUserId} />
            <input type="hidden" name="organizationId" value={organizationId} />
            <div>
              <label className="block text-sm font-medium">Motivo (obligatorio, min 10 chars)</label>
              <textarea
                name="reason"
                required
                minLength={10}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="mt-1 w-full rounded-md border border-[var(--color-border)] bg-white p-2 text-sm"
                rows={3}
                placeholder="Ticket #1234: usuario reporta error al crear fusión…"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" variant="destructive">
                Confirmar e impersonar
              </Button>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}
