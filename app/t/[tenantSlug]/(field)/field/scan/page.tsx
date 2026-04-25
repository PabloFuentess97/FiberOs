import { QRScanner } from "@/components/field/QRScanner";

export default function FieldScanPage() {
  return (
    <div className="p-4">
      <h1 className="text-xl font-semibold">Escanear QR</h1>
      <p className="mt-1 mb-4 text-sm text-[var(--color-muted)]">
        Apunta a la pegatina QR de la caja. Funciona sin conexión si descargaste los datos.
      </p>
      <QRScanner />
    </div>
  );
}
