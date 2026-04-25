"use client";

import { useEffect, useRef, useState } from "react";
import { Scanner, type IDetectedBarcode } from "@yudiel/react-qr-scanner";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { fieldDB } from "@/lib/field/db";

/**
 * Lee un QR, extrae el shortId del path `/c/{shortId}` y navega a
 * `/field/boxes/{id}` usando el inventario local (offline-first).
 * Si el shortId no está en Dexie, muestra error legible.
 */
export function QRScanner() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [lastScan, setLastScan] = useState<string | null>(null);
  const lockRef = useRef(false);

  useEffect(() => {
    // Solicitar permiso de cámara proactivamente
    if (typeof navigator !== "undefined" && navigator.mediaDevices?.getUserMedia) {
      navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } }).catch(() => {
        setError("Sin permiso de cámara. Ajustes → Permisos de esta web.");
      });
    }
  }, []);

  async function onDetected(codes: IDetectedBarcode[]) {
    if (lockRef.current) return;
    const code = codes[0];
    if (!code) return;
    lockRef.current = true;
    setLastScan(code.rawValue);

    try {
      const shortId = extractShortId(code.rawValue);
      if (!shortId) throw new Error("QR no reconocido. Esperaba URL con /c/{shortId}.");

      const db = fieldDB();
      const box = await db.boxes.where("shortId").equals(shortId).first();
      if (!box) {
        throw new Error(`Caja ${shortId} no está en el inventario local. Descarga actualización.`);
      }
      router.push(`/field/boxes/${box.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al procesar QR");
      setTimeout(() => {
        lockRef.current = false;
        setError(null);
      }, 2500);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="relative overflow-hidden rounded-xl bg-black">
        <Scanner
          onScan={onDetected}
          onError={(err) => setError(err instanceof Error ? err.message : String(err))}
          constraints={{ facingMode: "environment" }}
          styles={{ container: { width: "100%", aspectRatio: "1/1" } }}
          classNames={{ container: "w-full" }}
        />
      </div>
      {error ? (
        <div className="rounded-md bg-red-100 px-3 py-2 text-sm text-red-900">{error}</div>
      ) : null}
      {lastScan && !error ? (
        <p className="text-xs text-[var(--color-muted)]">Último escaneo: {lastScan}</p>
      ) : null}
      <div className="flex justify-between">
        <Button variant="outline" onClick={() => router.back()}>
          Cancelar
        </Button>
        <Button variant="ghost" onClick={() => (lockRef.current = false)}>
          Reactivar escáner
        </Button>
      </div>
    </div>
  );
}

function extractShortId(raw: string): string | null {
  // Acepta tanto URL completa como solo el shortId
  const urlMatch = /\/c\/([A-Z0-9]{6,12})(\b|\/|$)/i.exec(raw);
  if (urlMatch?.[1]) return urlMatch[1].toUpperCase();
  if (/^[A-Z0-9]{6,12}$/i.test(raw.trim())) return raw.trim().toUpperCase();
  return null;
}
