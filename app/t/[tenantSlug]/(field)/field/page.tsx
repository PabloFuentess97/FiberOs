import Link from "next/link";
import { MapPin, QrCode, RefreshCw } from "lucide-react";
import { FieldHomeClient } from "./home-client";

export default function FieldHome() {
  return (
    <div className="p-4">
      <h1 className="text-xl font-semibold">Campo</h1>
      <p className="mt-1 text-sm text-[var(--color-muted)]">
        Descarga el inventario cercano y escanea QR de cajas para trabajar sin conexión.
      </p>

      <FieldHomeClient />

      <div className="mt-6 grid grid-cols-2 gap-3">
        <Link
          href="/field/scan"
          className="flex flex-col items-center gap-2 rounded-xl border border-[var(--color-border)] bg-white p-6 text-center"
        >
          <QrCode size={32} className="text-[var(--brand-primary)]" />
          <span className="text-sm font-medium">Escanear QR</span>
        </Link>
        <Link
          href="/field/pending"
          className="flex flex-col items-center gap-2 rounded-xl border border-[var(--color-border)] bg-white p-6 text-center"
        >
          <RefreshCw size={32} className="text-[var(--brand-primary)]" />
          <span className="text-sm font-medium">Pendientes</span>
        </Link>
      </div>

      <p className="mt-6 text-xs text-[var(--color-muted)]">
        <MapPin size={12} className="mr-1 inline" />
        Bootstrap descarga hasta 5 km alrededor de tu posición GPS. Sin GPS, baja toda la red.
      </p>
    </div>
  );
}
