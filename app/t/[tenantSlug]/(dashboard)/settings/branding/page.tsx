import { eq } from "drizzle-orm";
import { requireTenantContext } from "@/lib/tenancy/guards";
import { db } from "@/lib/db";
import { tenantBranding } from "@/lib/db/schema/tenancy";
import { BrandingClient } from "./branding-client";

export default async function BrandingSettingsPage() {
  const ctx = await requireTenantContext();
  if (!ctx) return null;

  const [b] = await db
    .select()
    .from(tenantBranding)
    .where(eq(tenantBranding.organizationId, ctx.organizationId))
    .limit(1);

  return (
    <div className="mx-auto max-w-5xl p-6">
      <h1 className="text-2xl font-semibold">Branding</h1>
      <p className="mt-1 mb-6 text-sm text-[var(--color-muted)]">
        Personaliza el tenant con el nombre comercial, colores y logo. Se aplica al dashboard,
        a los emails y a las etiquetas PDF.
      </p>
      <BrandingClient
        initial={{
          displayName: b?.displayName ?? "",
          primaryColor: b?.primaryColor ?? "#1E5FFF",
          accentColor: b?.accentColor ?? "#0EA5E9",
          emailFromName: b?.emailFromName ?? "",
          supportEmail: b?.supportEmail ?? "",
          legalCompanyName: b?.legalCompanyName ?? "",
          logoUrl: b?.logoUrl ?? "",
          faviconUrl: b?.faviconUrl ?? "",
        }}
      />
    </div>
  );
}
