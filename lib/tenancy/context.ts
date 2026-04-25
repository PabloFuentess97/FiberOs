import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import type { PgTransaction } from "drizzle-orm/pg-core";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export interface TenantTxContext {
  userId: string;
  organizationId: string;
  impersonatedBy?: string | null;
}

/**
 * Envuelve una mutación dentro de una transacción con `SET LOCAL app.*`.
 * Todas las Server Actions y Route Handlers que escriben deben usar este helper.
 * Necesita pooler en modo SESSION (pgbouncer POOL_MODE=session).
 */
export async function withTenantTx<T>(
  ctx: TenantTxContext,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.user_id', ${ctx.userId}, true)`);
    await tx.execute(
      sql`SELECT set_config('app.organization_id', ${ctx.organizationId}, true)`,
    );
    if (ctx.impersonatedBy) {
      await tx.execute(sql`SELECT set_config('app.acted_as_by', ${ctx.impersonatedBy}, true)`);
    }
    return fn(tx);
  });
}

export type { PgTransaction };
