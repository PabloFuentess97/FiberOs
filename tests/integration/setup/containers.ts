import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { RedisContainer, type StartedRedisContainer } from "@testcontainers/redis";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import * as schema from "@/lib/db/schema";

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(HERE, "..", "..", "..", "lib", "db", "migrations", "sql");

export interface TestStack {
  pg: StartedPostgreSqlContainer;
  redis: StartedRedisContainer;
  databaseUrl: string;
  redisUrl: string;
  db: ReturnType<typeof drizzle>;
  client: ReturnType<typeof postgres>;
  stop: () => Promise<void>;
}

/**
 * Levanta Postgres 16 + PostGIS 3.4 y Redis 7 en contenedores efímeros.
 * Aplica el schema Drizzle + todas las migraciones SQL de /lib/db/migrations/sql.
 * Exportado para uso en tests de integración.
 */
export async function startTestStack(): Promise<TestStack> {
  const pg = await new PostgreSqlContainer("postgis/postgis:16-3.4")
    .withDatabase("fibraos_test")
    .withUsername("fibraos_test")
    .withPassword("fibraos_test")
    .start();

  const redis = await new RedisContainer("redis:7-alpine").start();

  const databaseUrl = pg.getConnectionUri();
  const redisUrl = redis.getConnectionUrl();

  // Inyectamos en env para que `lib/db`, `lib/queues`, etc. los encuentren
  process.env.DATABASE_URL = databaseUrl;
  process.env.DIRECT_URL = databaseUrl;
  process.env.REDIS_URL = redisUrl;
  process.env.AUTH_SECRET = "test_auth_secret_long_enough_to_pass_zod_validation_32bytes";
  process.env.NEXT_PUBLIC_ROOT_DOMAIN = "fibraos.test";
  process.env.INTERNAL_API_SECRET = "test_internal";
  process.env.SUPER_ADMIN_EMAILS = "superadmin@test.local";

  const client = postgres(databaseUrl, { max: 5, prepare: false });
  const db = drizzle(client, { schema });

  // Enable extensions + apply schema
  await client`CREATE EXTENSION IF NOT EXISTS postgis`;
  await client`CREATE EXTENSION IF NOT EXISTS pgcrypto`;
  await client`CREATE EXTENSION IF NOT EXISTS btree_gist`;

  // drizzle-kit push equivalente: usamos drizzle `pushSchema` via ephemeral connection
  // Alternativa más robusta: drizzle-kit generate ya emite SQL que aplicaríamos aquí,
  // pero el MVP no tiene migraciones versionadas (usa push). Usamos el schema TS directo.
  const { pushSchema } = await import("drizzle-kit/api");
  const { apply } = await pushSchema(schema, db as never);
  await apply();

  // Aplicar migraciones SQL custom (triggers, RLS, funciones)
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const f of files) {
    const content = readFileSync(join(MIGRATIONS_DIR, f), "utf8");
    try {
      await client.unsafe(content);
    } catch (err) {
      // Algunas instrucciones (DROP TRIGGER IF EXISTS sobre tablas que no existen todavía)
      // son permisivas; re-lanzamos solo errores no esperados.
      const msg = err instanceof Error ? err.message : String(err);
      if (!/does not exist|already exists/.test(msg)) {
        console.error(`Migración ${f} falló:`, msg);
        throw err;
      }
    }
  }

  // Set session configs por defecto para tests que no usan withTenantTx
  await client`SELECT set_config('app.organization_id', '00000000-0000-0000-0000-000000000000', false)`;

  return {
    pg,
    redis,
    databaseUrl,
    redisUrl,
    db,
    client,
    async stop() {
      await client.end();
      await Promise.all([pg.stop(), redis.stop()]);
    },
  };
}

/** Helper para ejecutar bloque con `SET LOCAL` de org y user. */
export async function withTenant<T>(
  stack: TestStack,
  tenant: { organizationId: string; userId: string },
  fn: () => Promise<T>,
): Promise<T> {
  return stack.db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.organization_id', ${tenant.organizationId}, true)`);
    await tx.execute(sql`SELECT set_config('app.user_id', ${tenant.userId}, true)`);
    // Durante el test, el withTenantTx de producción no se invoca: confiamos
    // en que el código bajo test use `tx` de Drizzle si recibe, o el client global.
    return fn();
  });
}
