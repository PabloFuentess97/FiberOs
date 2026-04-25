import Link from "next/link";
import { NewCableClient } from "./new-cable-client";

export default function NewCablePage() {
  return (
    <div className="mx-auto max-w-3xl p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Nuevo cable</h1>
        <Link href="/cables" className="text-sm text-[var(--color-muted)] hover:underline">
          Volver
        </Link>
      </div>
      <p className="mb-4 text-sm text-[var(--color-muted)]">
        Para dibujar la trayectoria real, usa <Link href="/map" className="underline">el mapa</Link>.
        Desde aquí puedes crear el cable con un trazado recto entre origen y destino (útil para imports manuales).
      </p>
      <NewCableClient />
    </div>
  );
}
