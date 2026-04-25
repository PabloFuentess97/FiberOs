import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { DashboardSidebar } from "@/components/shared/DashboardSidebar";
import { TopBar } from "@/components/shared/TopBar";
import { CommandPalette } from "@/components/shared/CommandPalette";
import { ImpersonationBanner } from "@/components/shared/ImpersonationBanner";
import { TenantSentryScope } from "@/lib/observability/sentry-tenant";
import { requireTenantContext } from "@/lib/tenancy/guards";
import { enforceTwoFactorIfNeeded } from "@/lib/auth/enforce-2fa";

export default async function DashboardLayout({
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
    const here = `${scheme}://${tenantSlug}.${root}${port}/`;
    redirect(`${scheme}://app.${root}${port}/login?next=${encodeURIComponent(here)}`);
  }

  // Sprint 9: enforce 2FA para admins
  const h = await headers();
  const pathname = h.get("x-invoke-path") ?? "/";
  await enforceTwoFactorIfNeeded(ctx, pathname);

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <ImpersonationBanner />
      <div className="flex flex-1 overflow-hidden">
        <TenantSentryScope
          organizationSlug={ctx.organizationSlug}
          organizationId={ctx.organizationId}
          userEmail={ctx.email}
          role={ctx.role}
        />
        <DashboardSidebar tenantName={tenantSlug} />
        <div className="flex flex-1 flex-col overflow-hidden">
          <TopBar email={ctx.email} role={ctx.role} />
          <main className="flex-1 overflow-auto bg-[var(--color-surface)]">{children}</main>
        </div>
      </div>
      <CommandPalette />
    </div>
  );
}
