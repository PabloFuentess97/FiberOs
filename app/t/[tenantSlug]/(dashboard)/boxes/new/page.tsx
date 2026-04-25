import Link from "next/link";
import { BoxForm } from "../box-form";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";

interface Props {
  searchParams: Promise<{ lat?: string; lng?: string }>;
}

export default async function NewBoxPage({ searchParams }: Props) {
  const { lat, lng } = await searchParams;
  const preset = {
    lat: lat ? Number(lat) : undefined,
    lng: lng ? Number(lng) : undefined,
  };

  return (
    <div className="mx-auto max-w-3xl p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Nueva caja</h1>
        <Link href="/boxes" className="text-sm text-[var(--color-muted)] hover:underline">
          Volver
        </Link>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Datos de la caja</CardTitle>
          <CardDescription>
            Si llegas desde el mapa con un pin soltado, la posición se rellena automáticamente.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <BoxForm preset={preset} />
        </CardContent>
      </Card>
    </div>
  );
}
