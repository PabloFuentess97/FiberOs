import { requireTenantContext } from "@/lib/tenancy/guards";
import { hasActiveTwoFactor } from "@/lib/auth/two-factor";
import { SecurityClient } from "./security-client";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, ShieldAlert } from "lucide-react";

export default async function SecuritySettingsPage() {
  const ctx = await requireTenantContext();
  if (!ctx) return null;

  const active = await hasActiveTwoFactor(ctx.userId);
  const requiredForRole = ctx.role === "admin"; // admins obligatorio

  return (
    <div className="mx-auto max-w-3xl p-6">
      <h1 className="text-2xl font-semibold">Seguridad</h1>
      <p className="mt-1 mb-6 text-sm text-[var(--color-muted)]">
        Autenticación de dos factores (2FA) con TOTP (Google Authenticator, 1Password, Authy…).
        {requiredForRole ? (
          <span className="ml-1 text-[var(--color-destructive)]">
            Obligatorio para tu rol.
          </span>
        ) : null}
      </p>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {active ? (
              <>
                <ShieldCheck size={18} className="text-green-600" />
                <span>2FA activo</span>
                <Badge tone="success">habilitado</Badge>
              </>
            ) : (
              <>
                <ShieldAlert size={18} className="text-amber-600" />
                <span>2FA sin configurar</span>
                <Badge tone="warning">recomendado</Badge>
              </>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <SecurityClient active={active} />
        </CardContent>
      </Card>
    </div>
  );
}
