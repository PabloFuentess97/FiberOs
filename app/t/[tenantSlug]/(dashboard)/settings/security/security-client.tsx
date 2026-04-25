"use client";

import { useState, useActionState, useTransition } from "react";
import { Copy, Download } from "lucide-react";
import {
  startEnrollmentAction,
  verifyCodeAction,
  disableTwoFactorAction,
  regenerateBackupCodesAction,
  type EnrollState,
} from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const INITIAL: EnrollState = { kind: "idle" };

export function SecurityClient({ active }: { active: boolean }) {
  const [enrollState, setEnrollState] = useState<EnrollState>(INITIAL);
  const [verifyState, verifyAction, verifyPending] = useActionState(verifyCodeAction, INITIAL);
  const [pending, start] = useTransition();
  const [newCodes, setNewCodes] = useState<string[] | null>(null);

  async function onStart() {
    start(async () => {
      const r = await startEnrollmentAction();
      setEnrollState(r);
    });
  }

  async function onRegenerate() {
    start(async () => {
      const codes = await regenerateBackupCodesAction();
      setNewCodes(codes);
    });
  }

  function copy(v: string) {
    navigator.clipboard.writeText(v).catch(() => {});
  }

  function downloadCodes(codes: string[]) {
    const blob = new Blob(
      [`FibraOS · Backup codes\nGenerados: ${new Date().toISOString()}\n\n${codes.join("\n")}\n`],
      { type: "text/plain" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "fibraos-backup-codes.txt";
    a.click();
    URL.revokeObjectURL(url);
  }

  // Vista: 2FA ya activo
  if (active && enrollState.kind !== "started" && verifyState.kind !== "verified") {
    return (
      <div className="space-y-4">
        <p className="text-sm">
          Tu cuenta requiere un código TOTP al iniciar sesión. Mantén los backup codes seguros.
        </p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onRegenerate} disabled={pending}>
            {pending ? "Generando…" : "Generar nuevos backup codes"}
          </Button>
        </div>
        {newCodes ? (
          <BackupCodesPanel codes={newCodes} onDownload={() => downloadCodes(newCodes)} />
        ) : null}
        <form action={disableTwoFactorAction} className="mt-6 border-t border-[var(--color-border)] pt-4">
          <Label htmlFor="code" className="text-sm">
            Desactivar 2FA (requiere código actual)
          </Label>
          <div className="mt-1 flex gap-2">
            <Input id="code" name="code" inputMode="numeric" pattern="[0-9]*" maxLength={6} placeholder="123456" />
            <Button type="submit" variant="destructive">
              Desactivar
            </Button>
          </div>
        </form>
      </div>
    );
  }

  // Vista: inicio del proceso
  if (enrollState.kind === "idle" && !active) {
    return (
      <div className="space-y-3">
        <p className="text-sm">
          Pulsa "Empezar" para generar un secret TOTP. Escanea el QR desde tu app de autenticación
          y verifica con un código.
        </p>
        <Button onClick={onStart} disabled={pending}>
          {pending ? "Preparando…" : "Empezar configuración"}
        </Button>
      </div>
    );
  }

  // Vista: QR + input verificación
  if (enrollState.kind === "started") {
    const qrImgUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(
      enrollState.otpauthUrl,
    )}`;
    return (
      <div className="space-y-4">
        <p className="text-sm">
          1. Escanea este QR con tu app TOTP, o introduce el secret manualmente.
        </p>
        <div className="flex gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qrImgUrl} alt="QR TOTP" className="h-44 w-44 rounded-md border border-[var(--color-border)]" />
          <div className="flex flex-col gap-2 text-xs">
            <Label>Secret (base32)</Label>
            <div className="flex items-center gap-2 rounded-md bg-[var(--color-surface)] px-2 py-1 font-mono">
              {enrollState.secret}
              <Button size="sm" variant="ghost" onClick={() => copy(enrollState.secret)}>
                <Copy size={10} />
              </Button>
            </div>
            <p className="text-[var(--color-muted)]">
              SHA1 · 30s · 6 dígitos
            </p>
          </div>
        </div>

        <form action={verifyAction} className="flex items-end gap-2 border-t border-[var(--color-border)] pt-4">
          <div className="flex-1">
            <Label htmlFor="code">2. Código generado por tu app</Label>
            <Input
              id="code"
              name="code"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              required
              placeholder="123456"
            />
          </div>
          <Button type="submit" disabled={verifyPending}>
            {verifyPending ? "Verificando…" : "Verificar y activar"}
          </Button>
        </form>

        {verifyState.kind === "error" ? (
          <p className="text-sm text-[var(--color-destructive)]">{verifyState.error}</p>
        ) : null}
      </div>
    );
  }

  // Vista: backup codes tras primera verificación
  if (verifyState.kind === "verified") {
    return (
      <div className="space-y-4">
        <p className="text-sm text-green-700">✓ 2FA activado correctamente.</p>
        <BackupCodesPanel
          codes={verifyState.backupCodes}
          onDownload={() => downloadCodes(verifyState.backupCodes)}
        />
        <p className="text-xs text-[var(--color-muted)]">
          Cada código sirve una sola vez. Guárdalos en un gestor de contraseñas o imprímelos.
          Sin ellos, perder el móvil implica contactar con soporte para recuperar la cuenta.
        </p>
      </div>
    );
  }

  return null;
}

function BackupCodesPanel({ codes, onDownload }: { codes: string[]; onDownload: () => void }) {
  return (
    <div className="rounded-md border border-amber-400 bg-amber-50 p-4">
      <div className="mb-2 flex items-center justify-between">
        <strong className="text-sm">Backup codes (guárdalos ahora)</strong>
        <Button size="sm" variant="outline" onClick={onDownload}>
          <Download size={12} /> Descargar .txt
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-1 font-mono text-sm">
        {codes.map((c) => (
          <code key={c} className="rounded bg-white px-2 py-1">
            {c}
          </code>
        ))}
      </div>
    </div>
  );
}
