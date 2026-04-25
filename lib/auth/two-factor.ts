import { createHash, randomBytes, createCipheriv, createDecipheriv } from "node:crypto";
import * as OTPAuth from "otpauth";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { userTwoFactor, backupCodes } from "@/lib/db/schema/two-factor";

const ALGO = "aes-256-gcm";
const BACKUP_CODES_COUNT = 10;
const BACKUP_CODE_LENGTH = 10;

function encryptionKey(): Buffer {
  const hex = process.env.TWO_FACTOR_ENCRYPTION_KEY;
  if (!hex) throw new Error("TWO_FACTOR_ENCRYPTION_KEY no configurado (32 bytes hex)");
  const key = Buffer.from(hex, "hex");
  if (key.length !== 32) throw new Error("TWO_FACTOR_ENCRYPTION_KEY debe ser 32 bytes (64 hex chars)");
  return key;
}

function encryptSecret(secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${ciphertext.toString("hex")}`;
}

function decryptSecret(blob: string): string {
  const [ivHex, tagHex, ctHex] = blob.split(":");
  if (!ivHex || !tagHex || !ctHex) throw new Error("invalid_encrypted_blob");
  const decipher = createDecipheriv(ALGO, encryptionKey(), Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  return Buffer.concat([decipher.update(Buffer.from(ctHex, "hex")), decipher.final()]).toString("utf8");
}

function hashCode(code: string): string {
  return createHash("sha256").update(code.replace(/\s+/g, "").toLowerCase()).digest("hex");
}

/** Genera un secret TOTP, lo guarda cifrado y devuelve la URL para el QR. */
export async function beginEnrollment(
  userId: string,
  email: string,
): Promise<{ secret: string; otpauthUrl: string }> {
  const totp = new OTPAuth.TOTP({
    issuer: "FibraOS",
    label: email,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: new OTPAuth.Secret({ size: 20 }),
  });

  const secretBase32 = totp.secret.base32;
  const encrypted = encryptSecret(secretBase32);

  await db
    .insert(userTwoFactor)
    .values({ userId, encryptedSecret: encrypted, verifiedAt: null })
    .onConflictDoUpdate({
      target: userTwoFactor.userId,
      set: { encryptedSecret: encrypted, verifiedAt: null },
    });

  return { secret: secretBase32, otpauthUrl: totp.toString() };
}

/** Verifica un código TOTP; si es la primera vez, marca verifiedAt y genera backup codes. */
export async function verifyCode(
  userId: string,
  code: string,
): Promise<{ ok: boolean; isFirstVerification?: boolean; backupCodes?: string[] }> {
  const [row] = await db
    .select()
    .from(userTwoFactor)
    .where(eq(userTwoFactor.userId, userId))
    .limit(1);
  if (!row) return { ok: false };

  const secret = decryptSecret(row.encryptedSecret);
  const totp = new OTPAuth.TOTP({
    issuer: "FibraOS",
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secret),
  });

  // Ventana ±1 para tolerancia de reloj (30s pre/post)
  const delta = totp.validate({ token: code.replace(/\s+/g, ""), window: 1 });
  if (delta === null) return { ok: false };

  const isFirstVerification = row.verifiedAt == null;

  await db
    .update(userTwoFactor)
    .set({ verifiedAt: row.verifiedAt ?? new Date(), lastUsedAt: new Date() })
    .where(eq(userTwoFactor.userId, userId));

  let codes: string[] | undefined;
  if (isFirstVerification) {
    codes = await regenerateBackupCodes(userId);
  }

  return { ok: true, isFirstVerification, backupCodes: codes };
}

export async function regenerateBackupCodes(userId: string): Promise<string[]> {
  // Borrar existentes (el usuario ve los nuevos)
  await db.delete(backupCodes).where(eq(backupCodes.userId, userId));

  const codes: string[] = [];
  for (let i = 0; i < BACKUP_CODES_COUNT; i++) {
    // Formato amigable: xxxx-xxxx
    const raw = randomBytes(8).toString("hex").slice(0, BACKUP_CODE_LENGTH);
    const formatted = `${raw.slice(0, 5)}-${raw.slice(5)}`;
    codes.push(formatted);
    await db.insert(backupCodes).values({ userId, codeHash: hashCode(formatted) });
  }
  return codes;
}

export async function consumeBackupCode(userId: string, code: string): Promise<boolean> {
  const hash = hashCode(code);
  const [row] = await db
    .select()
    .from(backupCodes)
    .where(eq(backupCodes.userId, userId))
    .limit(10);
  // Búsqueda linear entre 10 códigos — insignificante
  const matches = await db
    .select()
    .from(backupCodes)
    .where(eq(backupCodes.codeHash, hash))
    .limit(1);
  const found = matches.find((m) => m.userId === userId && !m.usedAt);
  if (!found) return false;
  await db
    .update(backupCodes)
    .set({ usedAt: new Date() })
    .where(eq(backupCodes.id, found.id));
  void row; // avoid unused warn
  return true;
}

export async function hasActiveTwoFactor(userId: string): Promise<boolean> {
  const [row] = await db
    .select({ verifiedAt: userTwoFactor.verifiedAt })
    .from(userTwoFactor)
    .where(eq(userTwoFactor.userId, userId))
    .limit(1);
  return !!row?.verifiedAt;
}

export async function disableTwoFactor(userId: string): Promise<void> {
  await db.delete(backupCodes).where(eq(backupCodes.userId, userId));
  await db.delete(userTwoFactor).where(eq(userTwoFactor.userId, userId));
}
