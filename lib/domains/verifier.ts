import { promises as dns } from "node:dns";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { tenantDomains } from "@/lib/db/schema/tenancy";
import { outboxEvents } from "@/lib/db/schema/billing";
import { logger } from "@/lib/observability/logger";

export interface VerifyResult {
  ok: boolean;
  error?: string;
  details?: Record<string, unknown>;
}

/**
 * Chequea que un hostname custom resuelve a nuestra IP/CNAME público.
 * Admite CNAME (→ saas.fibraos.com) o A/AAAA directo (apex).
 * Si está presente, valida también el TXT `_fibraos-verify.HOSTNAME`.
 */
export async function verifyHostname(
  hostname: string,
  expectedCname: string,
  expectedIPv4: string,
  verificationToken: string | null,
): Promise<VerifyResult> {
  try {
    // CNAME tiene prioridad (fuente de verdad)
    try {
      const cnames = await dns.resolveCname(hostname);
      const matches = cnames.some(
        (c) => c.replace(/\.$/, "").toLowerCase() === expectedCname.toLowerCase(),
      );
      if (matches) {
        // Verificación TXT opcional
        if (verificationToken) {
          await verifyTxt(hostname, verificationToken);
        }
        return { ok: true, details: { method: "cname", records: cnames } };
      }
      return { ok: false, error: `cname_mismatch`, details: { records: cnames, expected: expectedCname } };
    } catch (err) {
      // Sin CNAME → probamos A
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== "ENOTFOUND" && code !== "ENODATA") {
        return { ok: false, error: `cname_lookup_failed:${code}` };
      }
    }

    // Apex / A record
    const ips = await dns.resolve4(hostname).catch(() => [] as string[]);
    if (ips.includes(expectedIPv4)) {
      if (verificationToken) {
        await verifyTxt(hostname, verificationToken);
      }
      return { ok: true, details: { method: "a", records: ips } };
    }
    return { ok: false, error: "no_matching_record", details: { ips, expectedIPv4 } };
  } catch (err) {
    return { ok: false, error: `verify_exception:${(err as Error).message}` };
  }
}

async function verifyTxt(hostname: string, token: string): Promise<void> {
  try {
    const txt = await dns.resolveTxt(`_fibraos-verify.${hostname}`);
    const flat = txt.map((arr) => arr.join("")).map((s) => s.trim());
    if (!flat.includes(token)) {
      throw new Error("txt_token_mismatch");
    }
  } catch (err) {
    // TXT no bloquea: es opcional. Solo logueamos.
    logger.warn({ hostname, err: (err as Error).message }, "verify_txt_optional_failed");
  }
}

/**
 * Avanza el estado de un dominio según el backoff del blueprint (§12.3).
 * Devuelve siguiente delay en segundos o null si debe parar.
 */
export function nextBackoffSeconds(attempts: number): number | null {
  if (attempts < 30) return 60; // Cada 1 min durante 30 min
  if (attempts < 30 + 144) return 600; // Cada 10 min durante 24h
  if (attempts < 30 + 144 + 168) return 3600; // Cada 1h durante 7 días
  return null; // Falla
}

/**
 * Procesa un check de dominio. Lee la fila, llama a verifyHostname, actualiza
 * status. Si pasó a `verifying`, añade un outbox email "dominio verificado".
 */
export async function runDomainCheck(domainId: string): Promise<{
  status: string;
  nextAttempt: number | null;
}> {
  const [row] = await db.select().from(tenantDomains).where(eq(tenantDomains.id, domainId)).limit(1);
  if (!row) return { status: "not_found", nextAttempt: null };
  if (row.isSubdomain) return { status: "skipped", nextAttempt: null };
  if (row.status === "active" || row.status === "disabled") {
    return { status: row.status, nextAttempt: null };
  }

  const expectedCname =
    process.env.PUBLIC_HOSTNAME ?? `saas.${process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "fibraos.com"}`;
  const expectedIPv4 = process.env.PUBLIC_IPV4 ?? "";

  const result = await verifyHostname(
    row.hostname,
    expectedCname,
    expectedIPv4,
    row.verificationToken,
  );

  const newAttempts = (row.checkCount ?? 0) + 1;

  if (result.ok) {
    await db
      .update(tenantDomains)
      .set({
        status: "verifying",
        lastCheckAt: new Date(),
        lastCheckError: null,
        checkCount: newAttempts,
      })
      .where(eq(tenantDomains.id, domainId));

    // Outbox: notificar al admin que está a un paso
    await db.insert(outboxEvents).values({
      organizationId: row.organizationId,
      type: "email.domain_verifying",
      payload: { hostname: row.hostname, organizationId: row.organizationId },
    });

    return { status: "verifying", nextAttempt: 300 };
  }

  const next = nextBackoffSeconds(newAttempts);
  const status = next === null ? "failed" : row.status;

  await db
    .update(tenantDomains)
    .set({
      status,
      lastCheckAt: new Date(),
      lastCheckError: result.error ?? null,
      checkCount: newAttempts,
    })
    .where(eq(tenantDomains.id, domainId));

  if (status === "failed") {
    await db.insert(outboxEvents).values({
      organizationId: row.organizationId,
      type: "email.domain_failed",
      payload: { hostname: row.hostname, error: result.error ?? "unknown" },
    });
  }

  return { status, nextAttempt: next };
}

/**
 * Tras observar tráfico real al hostname (Caddy emitió cert), promover a active.
 * Se llama desde el endpoint interno cuando Caddy confirma que el cert fue emitido.
 */
export async function promoteToActive(domainId: string): Promise<void> {
  await db
    .update(tenantDomains)
    .set({
      status: "active",
      sslIssuedAt: new Date(),
      sslExpiresAt: new Date(Date.now() + 90 * 24 * 3600_000), // 90 días LE
    })
    .where(eq(tenantDomains.id, domainId));

  const [row] = await db.select().from(tenantDomains).where(eq(tenantDomains.id, domainId)).limit(1);
  if (row) {
    await db.insert(outboxEvents).values({
      organizationId: row.organizationId,
      type: "email.domain_active",
      payload: { hostname: row.hostname, organizationId: row.organizationId },
    });
  }
}
