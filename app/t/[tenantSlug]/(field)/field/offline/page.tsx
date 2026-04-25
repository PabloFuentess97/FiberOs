import Link from "next/link";
import { WifiOff } from "lucide-react";

export default function OfflineFallback() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 p-10 text-center">
      <WifiOff size={48} className="text-[var(--color-muted)]" />
      <h1 className="text-xl font-semibold">Sin conexión</h1>
      <p className="max-w-sm text-sm text-[var(--color-muted)]">
        Esta página aún no está en caché. Las rutas ya visitadas sí funcionan, incluyendo
        el escaneo de QR y el detalle de cajas descargadas.
      </p>
      <Link href="/field" className="text-sm text-[var(--brand-primary)] underline">
        Volver al inicio
      </Link>
    </div>
  );
}
