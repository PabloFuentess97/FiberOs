import { env } from "@/lib/utils/env";

// Lazy import para no cargar ioredis en edge runtime por accidente.
let client: import("ioredis").Redis | null = null;

export async function redis() {
  if (client) return client;
  const { default: Redis } = await import("ioredis");
  client = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: 3,
    lazyConnect: false,
    enableAutoPipelining: true,
  });
  return client;
}

export async function closeRedis() {
  if (client) {
    await client.quit();
    client = null;
  }
}
