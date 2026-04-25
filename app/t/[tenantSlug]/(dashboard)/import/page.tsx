import { ImportWizardClient } from "./import-wizard-client";

export default function ImportPage() {
  return (
    <div className="mx-auto max-w-5xl p-6">
      <h1 className="text-2xl font-semibold">Importar Excel</h1>
      <p className="mt-1 mb-6 text-sm text-[var(--color-muted)]">
        Sube un `.xlsx` o `.csv`, ajusta el mapeo de columnas, valida con dry-run y ejecuta.
        El trabajo corre en background: puedes cerrar la página y volver luego.
      </p>
      <ImportWizardClient />
    </div>
  );
}
