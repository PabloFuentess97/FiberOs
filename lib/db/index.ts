import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/lib/utils/env";
import * as schema from "./schema";

// En producción detrás de pgbouncer en modo session.
// En dev conecta directo al contenedor postgres.
const client = postgres(env.DATABASE_URL, {
  max: Number(process.env.PG_POOL_MAX ?? 10),
  prepare: false, // pgbouncer session-mode tolera prepared, pero deshabilitar evita sorpresas
  onnotice: () => {},
});

export const db = drizzle(client, { schema, logger: process.env.DRIZZLE_LOG === "1" });

// Para migraciones (bypass pgbouncer)
export function directClient() {
  return postgres(env.DIRECT_URL ?? env.DATABASE_URL, { max: 1, prepare: false });
}

export type DbClient = typeof db;
export { schema };
