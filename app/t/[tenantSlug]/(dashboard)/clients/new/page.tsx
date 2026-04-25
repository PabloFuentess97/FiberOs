import Link from "next/link";
import { ClientForm } from "../client-form";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

export default function NewClientPage() {
  return (
    <div className="mx-auto max-w-3xl p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Nuevo cliente</h1>
        <Link href="/clients" className="text-sm text-[var(--color-muted)] hover:underline">
          Volver
        </Link>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Datos del cliente</CardTitle>
        </CardHeader>
        <CardContent>
          <ClientForm />
        </CardContent>
      </Card>
    </div>
  );
}
