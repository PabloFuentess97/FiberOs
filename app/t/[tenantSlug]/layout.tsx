import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { organizations, tenantBranding } from "@/lib/db/schema/tenancy";

interface Props {
  children: React.ReactNode;
  params: Promise<{ tenantSlug: string }>;
}

export default async function TenantLayout({ children, params }: Props) {
  const { tenantSlug } = await params;

  const [org] = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      slug: organizations.slug,
    })
    .from(organizations)
    .where(eq(organizations.slug, tenantSlug))
    .limit(1);

  if (!org) notFound();

  const [branding] = await db
    .select()
    .from(tenantBranding)
    .where(eq(tenantBranding.organizationId, org.id))
    .limit(1);

  const style = {
    "--brand-primary": branding?.primaryColor ?? "#1E5FFF",
    "--brand-accent": branding?.accentColor ?? "#0EA5E9",
  } as React.CSSProperties;

  return (
    <div style={style} className="min-h-full">
      {children}
    </div>
  );
}
