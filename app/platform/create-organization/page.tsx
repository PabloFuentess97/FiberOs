import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth/session";
import { CreateOrgForm } from "./create-org-form";

export default async function CreateOrganizationPage() {
  const session = await getCurrentSession();
  if (!session?.user) redirect("/login");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Crea tu organización</h1>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          Te daremos un subdominio propio para tu equipo.
        </p>
      </div>
      <CreateOrgForm />
    </div>
  );
}
