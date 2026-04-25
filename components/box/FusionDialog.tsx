"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface FusionDialogProps {
  open: boolean;
  title: string;
  description?: string;
  warning?: string;
  onConfirm: (values: { lossDb?: number; notes?: string }) => Promise<void> | void;
  onCancel: () => void;
}

export function FusionDialog({ open, title, description, warning, onConfirm, onCancel }: FusionDialogProps) {
  const [lossDb, setLossDb] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setLossDb("");
      setNotes("");
      setSubmitting(false);
    }
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-lg">
        <h2 className="text-lg font-semibold">{title}</h2>
        {description ? (
          <p className="mt-1 text-sm text-[var(--color-muted)]">{description}</p>
        ) : null}
        {warning ? (
          <div className="mt-3 rounded-md bg-amber-100 p-2 text-xs text-amber-900">
            ⚠ {warning}
          </div>
        ) : null}
        <form
          className="mt-4 flex flex-col gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setSubmitting(true);
            await onConfirm({
              lossDb: lossDb ? Number(lossDb) : undefined,
              notes: notes || undefined,
            });
            setSubmitting(false);
          }}
        >
          <div className="flex flex-col gap-1">
            <Label htmlFor="lossDb">Pérdida (dB)</Label>
            <Input
              id="lossDb"
              type="number"
              step="0.01"
              min={0}
              max={10}
              placeholder="0.15"
              value={lossDb}
              onChange={(e) => setLossDb(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="notes">Notas</Label>
            <textarea
              id="notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded-md border border-[var(--color-border)] bg-white px-3 py-2 text-sm"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>
              Cancelar
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Guardando…" : "Confirmar fusión"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
