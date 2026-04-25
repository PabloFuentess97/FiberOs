"use server";

import { db } from "@/lib/db";
import { impersonations } from "@/lib/db/schema/billing";
import { outboxEvents } from "@/lib/db/schema/billing";
import { users } from "@/lib/db/schema/auth";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { cookies } from "next/headers";
import { requireSuperAdmin } from "@/lib/auth/super-admin";
import { logger } from "@/lib/observability/logger";

const IMPERSONATION_COOKIE = "fibraos_impersonation";

const impersonateSchema = z.object({
  targetUserId: z.string().uuid(),
  organizationId: z.string().uuid(),
  reason: z.string().min(10).max(500),
});

/**
 * Registra una impersonación y setea cookie con JWT-like. Duración fija 2h.
 * NOTA: este MVP implementa el modelo de auditoría y la notificación por email;
 * la asunción real de sesión en Better Auth se conecta cuando el usuario navega
 * a un tenant con la cookie activa (trabajo pendiente del middleware en Sprint 8).
 */
export async function startImpersonationAction(formData: FormData): Promise<void> {
  const sa = await requireSuperAdmin();
  if (!sa) throw new Error("unauthorized");

  const parsed = impersonateSchema.parse({
    targetUserId: formData.get("targetUserId"),
    organizationId: formData.get("organizationId"),
    reason: formData.get("reason"),
  });

  const [target] = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, parsed.targetUserId))
    .limit(1);
  if (!target) throw new Error("target_not_found");

  const endsAt = new Date(Date.now() + 2 * 3600_000); // 2 horas
  const [row] = await db
    .insert(impersonations)
    .values({
      actorUserId: sa.userId,
      targetUserId: parsed.targetUserId,
      organizationId: parsed.organizationId,
      reason: parsed.reason,
      endsAt,
    })
    .returning({ id: impersonations.id });
  if (!row) throw new Error("insert_failed");

  // Notificación al target via outbox
  await db.insert(outboxEvents).values({
    organizationId: parsed.organizationId,
    type: "email.impersonation_notice",
    payload: {
      to: target.email,
      adminEmail: sa.email,
      reason: parsed.reason,
      endsAt: endsAt.toISOString(),
    },
  });

  // Setear cookie firmada (simplificada: el secret + payload; en prod usar JWT)
  const cookieValue = Buffer.from(
    JSON.stringify({
      impersonationId: row.id,
      actorUserId: sa.userId,
      targetUserId: parsed.targetUserId,
      organizationId: parsed.organizationId,
      endsAt: endsAt.getTime(),
    }),
  ).toString("base64url");

  const store = await cookies();
  store.set(IMPERSONATION_COOKIE, cookieValue, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 2 * 3600,
    path: "/",
  });

  logger.info(
    { actor: sa.email, target: target.email, orgId: parsed.organizationId },
    "impersonation_started",
  );

  // Redirect al tenant
  const root = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "fibraos.com";
  const scheme = process.env.NODE_ENV === "production" ? "https" : "http";
  const port = process.env.NODE_ENV === "production" ? "" : ":3000";
  // Resolvemos slug
  const { organizations } = await import("@/lib/db/schema/tenancy");
  const [org] = await db
    .select({ slug: organizations.slug })
    .from(organizations)
    .where(eq(organizations.id, parsed.organizationId))
    .limit(1);
  if (!org) throw new Error("org_not_found");

  redirect(`${scheme}://${org.slug}.${root}${port}/?impersonating=1`);
}

export async function stopImpersonationAction(): Promise<void> {
  const store = await cookies();
  const raw = store.get(IMPERSONATION_COOKIE);
  if (raw) {
    try {
      const data = JSON.parse(Buffer.from(raw.value, "base64url").toString("utf8")) as {
        impersonationId: string;
      };
      await db
        .update(impersonations)
        .set({ endedAt: new Date() })
        .where(eq(impersonations.id, data.impersonationId));
    } catch {
      /* ignore malformed */
    }
  }
  store.delete(IMPERSONATION_COOKIE);
  redirect("/super-admin");
}
