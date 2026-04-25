"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentSession } from "@/lib/auth/session";
import {
  beginEnrollment,
  verifyCode,
  disableTwoFactor,
  regenerateBackupCodes,
} from "@/lib/auth/two-factor";

export type EnrollState =
  | { kind: "idle" }
  | { kind: "started"; otpauthUrl: string; secret: string }
  | { kind: "verified"; backupCodes: string[] }
  | { kind: "error"; error: string };

export async function startEnrollmentAction(): Promise<EnrollState> {
  const session = await getCurrentSession();
  if (!session?.user) return { kind: "error", error: "unauthorized" };
  const r = await beginEnrollment(session.user.id, session.user.email);
  return { kind: "started", otpauthUrl: r.otpauthUrl, secret: r.secret };
}

export async function verifyCodeAction(_prev: EnrollState, formData: FormData): Promise<EnrollState> {
  const session = await getCurrentSession();
  if (!session?.user) return { kind: "error", error: "unauthorized" };

  const parsed = z
    .object({ code: z.string().min(6).max(10) })
    .safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { kind: "error", error: "validation_error" };

  const r = await verifyCode(session.user.id, parsed.data.code);
  if (!r.ok) return { kind: "error", error: "Código incorrecto." };

  revalidatePath("/settings/security");
  if (r.isFirstVerification && r.backupCodes) {
    return { kind: "verified", backupCodes: r.backupCodes };
  }
  return { kind: "idle" };
}

export async function disableTwoFactorAction(formData: FormData): Promise<void> {
  const session = await getCurrentSession();
  if (!session?.user) throw new Error("unauthorized");
  // Exigir código vigente para desactivar (prevenir ataque de sesión robada)
  const code = z.string().min(6).max(10).parse(formData.get("code"));
  const r = await verifyCode(session.user.id, code);
  if (!r.ok) throw new Error("Código requerido para desactivar 2FA");
  await disableTwoFactor(session.user.id);
  revalidatePath("/settings/security");
}

export async function regenerateBackupCodesAction(): Promise<string[]> {
  const session = await getCurrentSession();
  if (!session?.user) throw new Error("unauthorized");
  return regenerateBackupCodes(session.user.id);
}
