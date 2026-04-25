import { PendingClient } from "./pending-client";

export default function FieldPendingPage() {
  return (
    <div className="p-4">
      <h1 className="text-xl font-semibold">Mis cambios pendientes</h1>
      <p className="mt-1 mb-4 text-sm text-[var(--color-muted)]">
        Mutaciones hechas offline. Se sincronizan automáticamente al recuperar red.
        Los conflictos esperan tu decisión.
      </p>
      <PendingClient />
    </div>
  );
}
