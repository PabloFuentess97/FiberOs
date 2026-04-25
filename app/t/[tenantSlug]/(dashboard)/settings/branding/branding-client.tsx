"use client";

import { useActionState, useState } from "react";
import { updateBrandingAction, type BrandingState } from "./actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

interface BrandingValues {
  displayName: string;
  primaryColor: string;
  accentColor: string;
  emailFromName: string;
  supportEmail: string;
  legalCompanyName: string;
  logoUrl: string;
  faviconUrl: string;
}

const INITIAL: BrandingState = {};

export function BrandingClient({ initial }: { initial: BrandingValues }) {
  const [state, action, pending] = useActionState(updateBrandingAction, INITIAL);
  const [v, setV] = useState<BrandingValues>(initial);

  function update<K extends keyof BrandingValues>(key: K, value: BrandingValues[K]) {
    setV((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <div className="grid gap-6 md:grid-cols-[1fr_1fr]">
      <form action={action} className="space-y-4">
        <FormRow label="Nombre comercial" id="displayName">
          <Input
            id="displayName"
            name="displayName"
            value={v.displayName}
            onChange={(e) => update("displayName", e.target.value)}
            placeholder="TMDigital"
          />
        </FormRow>

        <div className="grid grid-cols-2 gap-3">
          <FormRow label="Color primario" id="primaryColor">
            <div className="flex gap-2">
              <input
                type="color"
                value={v.primaryColor}
                onChange={(e) => update("primaryColor", e.target.value)}
                className="h-9 w-12 cursor-pointer rounded border border-[var(--color-border)]"
              />
              <Input
                id="primaryColor"
                name="primaryColor"
                value={v.primaryColor}
                onChange={(e) => update("primaryColor", e.target.value)}
                className="font-mono text-xs"
              />
            </div>
          </FormRow>
          <FormRow label="Acento" id="accentColor">
            <div className="flex gap-2">
              <input
                type="color"
                value={v.accentColor}
                onChange={(e) => update("accentColor", e.target.value)}
                className="h-9 w-12 cursor-pointer rounded border border-[var(--color-border)]"
              />
              <Input
                id="accentColor"
                name="accentColor"
                value={v.accentColor}
                onChange={(e) => update("accentColor", e.target.value)}
                className="font-mono text-xs"
              />
            </div>
          </FormRow>
        </div>

        <FormRow label="Logo (URL)" id="logoUrl">
          <Input
            id="logoUrl"
            name="logoUrl"
            value={v.logoUrl}
            onChange={(e) => update("logoUrl", e.target.value)}
            placeholder="https://cdn.../logo.svg"
          />
        </FormRow>

        <FormRow label="Favicon (URL)" id="faviconUrl">
          <Input
            id="faviconUrl"
            name="faviconUrl"
            value={v.faviconUrl}
            onChange={(e) => update("faviconUrl", e.target.value)}
          />
        </FormRow>

        <FormRow label="Email &lsquo;from&rsquo; nombre" id="emailFromName">
          <Input
            id="emailFromName"
            name="emailFromName"
            value={v.emailFromName}
            onChange={(e) => update("emailFromName", e.target.value)}
          />
        </FormRow>

        <FormRow label="Email de soporte" id="supportEmail">
          <Input
            id="supportEmail"
            name="supportEmail"
            type="email"
            value={v.supportEmail}
            onChange={(e) => update("supportEmail", e.target.value)}
          />
        </FormRow>

        <FormRow label="Razón social" id="legalCompanyName">
          <Input
            id="legalCompanyName"
            name="legalCompanyName"
            value={v.legalCompanyName}
            onChange={(e) => update("legalCompanyName", e.target.value)}
          />
        </FormRow>

        {state.error ? <p className="text-sm text-[var(--color-destructive)]">{state.error}</p> : null}
        {state.ok ? <p className="text-sm text-green-700">Branding guardado.</p> : null}

        <div className="flex justify-end">
          <Button type="submit" disabled={pending}>
            {pending ? "Guardando…" : "Guardar"}
          </Button>
        </div>
      </form>

      <Card>
        <CardHeader>
          <CardTitle>Preview</CardTitle>
        </CardHeader>
        <CardContent>
          <div
            className="rounded-xl border border-[var(--color-border)] bg-white p-4"
            style={
              { "--brand-primary": v.primaryColor, "--brand-accent": v.accentColor } as React.CSSProperties
            }
          >
            <div className="flex items-center gap-2 border-b border-[var(--color-border)] pb-3">
              {v.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={v.logoUrl} alt="logo" className="h-6" />
              ) : (
                <span className="inline-block h-6 w-6 rounded" style={{ background: v.primaryColor }} />
              )}
              <span className="font-semibold">{v.displayName || "Tu tenant"}</span>
            </div>
            <div className="mt-3 space-y-2">
              <button
                className="rounded-md px-3 py-1.5 text-sm font-medium text-white"
                style={{ background: v.primaryColor }}
                type="button"
              >
                Botón primario
              </button>
              <span
                className="ml-2 inline-block rounded-md px-2 py-0.5 text-xs text-white"
                style={{ background: v.accentColor }}
              >
                Badge acento
              </span>
            </div>
          </div>

          <div className="mt-4 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
            <div className="text-xs text-[var(--color-muted)]">Email de ejemplo</div>
            <div style={{ height: 4, background: v.primaryColor, borderRadius: 2, margin: "8px 0" }} />
            <div className="text-sm font-medium">
              {v.emailFromName || v.displayName || "FibraOS"}
            </div>
            <div className="mt-1 text-xs text-[var(--color-muted)]">
              Soporte: {v.supportEmail || "—"}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function FormRow({
  label,
  id,
  children,
}: {
  label: string;
  id: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}
