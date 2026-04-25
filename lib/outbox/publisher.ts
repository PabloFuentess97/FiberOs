import { db } from "@/lib/db";
import { outboxEvents, type OutboxEvent } from "@/lib/db/schema/billing";
import { outboxQueue } from "@/lib/queues";

export type OutboxEventType =
  | "email.invitation"
  | "email.domain_verifying"
  | "email.domain_active"
  | "email.domain_failed"
  | "email.impersonation_notice"
  | "email.bounce"
  | "webhook.stripe_event"
  | string;

/**
 * Inserta un evento en la tabla outbox dentro de la transacción del caller
 * (debe pasar su propio tx). Después encola en BullMQ.
 * El patrón clave: estado + evento atómicos en BD; el worker lee y dispatcha.
 */
export async function publishOutbox(
  tx: typeof db,
  event: { organizationId?: string | null; type: OutboxEventType; payload: Record<string, unknown> },
): Promise<string> {
  const [row] = await tx
    .insert(outboxEvents)
    .values({
      organizationId: event.organizationId ?? null,
      type: event.type,
      payload: event.payload,
    })
    .returning({ id: outboxEvents.id });
  if (!row) throw new Error("outbox_insert_failed");

  // Encolamos inmediatamente. Si Redis cae, el dispatcher recuperará events
  // pendientes en su próximo tick (fallback por scan periódico).
  try {
    await outboxQueue().add(`event:${row.id}`, { eventId: row.id }, { jobId: row.id });
  } catch {
    // Silencioso: el dispatcher lo recogerá por scan.
  }
  return row.id;
}

export type { OutboxEvent };
