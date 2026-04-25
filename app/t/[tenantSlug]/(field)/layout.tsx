import { redirect } from "next/navigation";
import { requireTenantContext } from "@/lib/tenancy/guards";
import { FieldShell } from "@/components/field/FieldShell";

export default async function FieldLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const ctx = await requireTenantContext();
  if (!ctx) {
    const root = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "fibraos.local";
    const scheme = process.env.NODE_ENV === "production" ? "https" : "http";
    const port = process.env.NODE_ENV === "production" ? "" : ":3000";
    const here = `${scheme}://${tenantSlug}.${root}${port}/field`;
    redirect(`${scheme}://app.${root}${port}/login?next=${encodeURIComponent(here)}`);
  }
  return (
    <FieldShell tenantName={tenantSlug} email={ctx.email} role={ctx.role}>
      {children}
    </FieldShell>
  );
}
