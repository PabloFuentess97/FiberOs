import { RateLimiterRedis, RateLimiterMemory } from "rate-limiter-flexible";
import { eq } from "drizzle-orm";
import { redisConnection } from "@/lib/queues";
import { db } from "@/lib/db";
import { subscriptions, planQuotas } from "@/lib/db/schema/billing";

/**
 * Rate limiter por organización, configurado con `plan_quotas.api_rate_per_minute`.
 * En dev sin Redis usa backend in-memory.
 */

const cache = new Map<string, RateLimiterRedis | RateLimiterMemory>();
const planCache = new Map<string, { rate: number; expiresAt: number }>();

async function rateForOrg(organizationId: string): Promise<number> {
  const cached = planCache.get(organizationId);
  if (cached && cached.expiresAt > Date.now()) return cached.rate;

  const [sub] = await db
    .select({ plan: subscriptions.plan })
    .from(subscriptions)
    .where(eq(subscriptions.organizationId, organizationId))
    .limit(1);
  const plan = sub?.plan ?? "trial";
  const [q] = await db.select().from(planQuotas).where(eq(planQuotas.plan, plan)).limit(1);
  const rate = q?.apiRatePerMinute ?? 60;
  planCache.set(organizationId, { rate, expiresAt: Date.now() + 60_000 });
  return rate;
}

function keyFor(org: string, bucket: string): string {
  return `rl:${org}:${bucket}`;
}

async function getLimiter(org: string, rate: number): Promise<RateLimiterRedis | RateLimiterMemory> {
  const cacheKey = `${org}:${rate}`;
  const hit = cache.get(cacheKey);
  if (hit) return hit;

  let limiter: RateLimiterRedis | RateLimiterMemory;
  try {
    limiter = new RateLimiterRedis({
      storeClient: redisConnection(),
      keyPrefix: "fibraos-rl",
      points: rate,
      duration: 60,
    });
  } catch {
    limiter = new RateLimiterMemory({ points: rate, duration: 60 });
  }
  cache.set(cacheKey, limiter);
  return limiter;
}

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

/**
 * Consume 1 punto del bucket de la org. Llamar al inicio de Route Handlers
 * que exponen superficie pública (export/xlsx, labels, field/sync).
 */
export async function consumeRateLimit(
  organizationId: string,
  bucket = "default",
): Promise<RateLimitResult> {
  const rate = await rateForOrg(organizationId);
  const limiter = await getLimiter(organizationId, rate);
  try {
    const res = await limiter.consume(keyFor(organizationId, bucket), 1);
    return { ok: true, remaining: res.remainingPoints, retryAfterSeconds: 0 };
  } catch (rej) {
    const retry = Math.ceil(((rej as { msBeforeNext?: number }).msBeforeNext ?? 1000) / 1000);
    return { ok: false, remaining: 0, retryAfterSeconds: retry };
  }
}

/** Invalida la caché de plan para un tenant (tras upgrade/downgrade). */
export function invalidatePlanCache(organizationId: string): void {
  planCache.delete(organizationId);
}
