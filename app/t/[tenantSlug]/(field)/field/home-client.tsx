"use client";

import { useEffect, useState } from "react";
import { Download, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { bootstrapField, hasLocalData } from "@/lib/field/bootstrap";
import { fieldDB } from "@/lib/field/db";

export function FieldHomeClient() {
  const [status, setStatus] = useState<"idle" | "downloading" | "done" | "error">("idle");
  const [msg, setMsg] = useState<string | null>(null);
  const [local, setLocal] = useState<{ boxes: number; fibers: number } | null>(null);

  async function refreshLocal() {
    try {
      const db = fieldDB();
      const [boxes, fibers] = await Promise.all([db.boxes.count(), db.fibers.count()]);
      setLocal({ boxes, fibers });
    } catch {
      /* pre-SSR */
    }
  }

  useEffect(() => {
    refreshLocal();
  }, []);

  async function onBootstrap() {
    setStatus("downloading");
    setMsg("Descargando…");
    try {
      // Intentamos bbox 5km alrededor del GPS; si no hay GPS, sin bbox
      let bbox: [number, number, number, number] | undefined;
      if ("geolocation" in navigator) {
        try {
          const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
            navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 }),
          );
          const { latitude, longitude } = pos.coords;
          const dLat = 0.045; // ~5 km
          const dLng = 0.055;
          bbox = [longitude - dLng, latitude - dLat, longitude + dLng, latitude + dLat];
        } catch {
          /* sin GPS: bootstrap completo */
        }
      }
      const count = await bootstrapField(bbox);
      setStatus("done");
      setMsg(`${count} cajas descargadas${bbox ? " (radio 5km)" : " (toda la red)"}.`);
      await refreshLocal();
    } catch (err) {
      setStatus("error");
      setMsg(err instanceof Error ? err.message : "Error de descarga");
    }
  }

  return (
    <div className="mt-4 rounded-xl border border-[var(--color-border)] bg-white p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">Datos locales</p>
          <p className="text-xs text-[var(--color-muted)]">
            {local ? `${local.boxes} cajas · ${local.fibers} fibras` : "Cargando…"}
          </p>
        </div>
        <Button onClick={onBootstrap} disabled={status === "downloading"} size="sm">
          {status === "done" ? <CheckCircle2 size={14} /> : <Download size={14} />}
          {status === "downloading" ? "Descargando…" : "Descargar cercanos"}
        </Button>
      </div>
      {msg ? (
        <p
          className={`mt-2 text-xs ${
            status === "error" ? "text-[var(--color-destructive)]" : "text-[var(--color-muted)]"
          }`}
        >
          {msg}
        </p>
      ) : null}
    </div>
  );
}
