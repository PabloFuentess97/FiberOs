import "server-only";
import { and, eq, or, gt } from "drizzle-orm";
import { db } from "@/lib/db";
import { organizations, tenantDomains, tenantSlugAliases } from "@/lib/db/schema/tenancy";
import { redis } from "@/lib/redis";
import { logger } from "@/lib/observability/logger";

export type HostKind = "subdomain" | "custom";

export interface ResolvedTenant {
  id: string;
  slug: string;
  name: string;
  hostname: string;
  kind: HostKind;
}

const CACHE_TTL_SECONDS = 60;
const CACHE_PREFIX = "tenant:host:";

export async function resolveTenantByHost(host: string): Promise<ResolvedTenant | null> {
  const h = host.toLowerCase().trim();
  if (!h) return null;

  // 1. Intentar cache Redis (60s)
  try {
    const r = await redis();
    const cached = await r.get(CACHE_PREFIX + h);
    if (cached === "__null__") return null;
    if (cached) return JSON.parse(cached) as ResolvedTenant;
  } catch (err) {
    logger.warn({ err, host: h }, "tenant cache miss/error, falling back to DB");
  }

  // 2. Buscar en tenant_domains
  const rows = await db
    .select({
      id: organizations.id,
      slug: organizations.slug,
      name: organizations.name,
      hostname: tenantDomains.hostname,
      isSubdomain: tenantDomains.isSubdomain,
      status: tenantDomains.status,
    })
    .from(tenantDomains)
    .innerJoin(organizations, eq(organizations.id, tenantDomains.organizationId))
    .where(
      and(
        eq(tenantDomains.hostname, h),
        or(eq(tenantDomains.status, "active"), eq(tenantDomains.status, "verifying")),
      ),
    )
    .limit(1);

  const row = rows[0];
  if (row) {
    const resolved: ResolvedTenant = {
      id: row.id,
      slug: row.slug,
      name: row.name,
      hostname: row.hostname,
      kind: row.isSubdomain ? "subdomain" : "custom",
    };
    await writeCache(h, resolved);
    return resolved;
  }

  // 3. Intentar como alias de slug (solo si es subdominio del root)
  const root = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "";
  if (root && h.endsWith(`.${root}`)) {
    const sub = h.slice(0, -1 - root.length);
    const [alias] = await db
      .select({ organizationId: tenantSlugAliases.organizationId, expiresAt: tenantSlugAliases.expiresAt })
      .from(tenantSlugAliases)
      .where(and(eq(tenantSlugAliases.slug, sub), gt(tenantSlugAliases.expiresAt, new Date())))
      .limit(1);
    if (alias) {
      const [org] = await db
        .select()
        .from(organizations)
        .where(eq(organizations.id, alias.organizationId))
        .limit(1);
      if (org) {
        const resolved: ResolvedTenant = {
          id: org.id,
          slug: org.slug,
          name: org.name,
          hostname: h,
          kind: "subdomain",
        };
        await writeCache(h, resolved);
        return resolved;
      }
    }
  }

  // 4. No encontrado → cachear "null" para evitar martilleo
  await writeCacheNull(h);
  return null;
}

export async function invalidateTenantCache(host: string): Promise<void> {
  try {
    const r = await redis();
    await r.del(CACHE_PREFIX + host.toLowerCase());
  } catch (err) {
    logger.warn({ err, host }, "invalidateTenantCache failed");
  }
}

async function writeCache(host: string, tenant: ResolvedTenant) {
  try {
    const r = await redis();
    await r.set(CACHE_PREFIX + host, JSON.stringify(tenant), "EX", CACHE_TTL_SECONDS);
  } catch {
    /* best-effort */
  }
}

async function writeCacheNull(host: string) {
  try {
    const r = await redis();
    await r.set(CACHE_PREFIX + host, "__null__", "EX", CACHE_TTL_SECONDS);
  } catch {
    /* best-effort */
  }
}
