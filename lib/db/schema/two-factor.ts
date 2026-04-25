import { pgTable, text, timestamp, uuid, boolean, index, unique } from "drizzle-orm/pg-core";
import { users } from "./auth";

/**
 * 2FA TOTP: secretos cifrados por usuario + backup codes single-use.
 * Sprint 9.
 */

export const userTwoFactor = pgTable(
  "user_two_factor",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    // Secret base32 (160 bits) cifrado con AES-256-GCM (env TWO_FACTOR_ENCRYPTION_KEY).
    // Formato: "iv:tag:ciphertext" en hex.
    encryptedSecret: text("encrypted_secret").notNull(),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
);

export const backupCodes = pgTable(
  "backup_codes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // SHA-256 hash; comparamos el hash del input del usuario
    codeHash: text("code_hash").notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index("backup_codes_user_idx").on(t.userId),
    codeUnique: unique("backup_codes_hash_unique").on(t.userId, t.codeHash),
  }),
);

export type UserTwoFactor = typeof userTwoFactor.$inferSelect;
export type BackupCode = typeof backupCodes.$inferSelect;
