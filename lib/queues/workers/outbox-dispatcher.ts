import { Worker, type Job } from "bullmq";
import { eq, and, isNull } from "drizzle-orm";
import { redisConnection, QUEUE_NAMES, outboxQueue, type OutboxJobPayload } from "../index";
import { db } from "@/lib/db";
import { outboxEvents } from "@/lib/db/schema/billing";
import { tenantBranding } from "@/lib/db/schema/tenancy";
import {
  renderInvitation,
  renderDomainActive,
  renderDomainFailed,
  renderImpersonationNotice,
} from "@/lib/email/templates";
import { logger } from "@/lib/observability/logger";

async function sendEmail(to: string, subject: string, html: string, text: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.AUTH_EMAIL_FROM ?? "no-reply@fibraos.com";

  if (!apiKey) {
    // Dev: log + mailpit SMTP captura
    logger.info({ to, subject }, "email_dev_noop");
    return;
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to, subject, html, text }),
  });
  if (!res.ok) {
    throw new Error(`resend_failed:${res.status}:${await res.text()}`);
  }
}

async function resolveBranding(orgId: string | null) {
  if (!orgId) return { primary: "#1E5FFF", displayName: "FibraOS" };
  const [b] = await db.select().from(tenantBranding).where(eq(tenantBranding.organizationId, orgId)).limit(1);
  return {
    primary: b?.primaryColor ?? "#1E5FFF",
    displayName: b?.displayName ?? "FibraOS",
  };
}

async function dispatchOne(eventId: string): Promise<void> {
  const [ev] = await db.select().from(outboxEvents).where(eq(outboxEvents.id, eventId)).limit(1);
  if (!ev) throw new Error("event_not_found");
  if (ev.dispatchedAt) return; // idempotente

  const payload = ev.payload as Record<string, unknown>;
  const brand = await resolveBranding(ev.organizationId ?? null);

  try {
    switch (ev.type) {
      case "email.invitation": {
        const { to, inviterName, tenantName, acceptUrl } = payload as {
          to: string;
          inviterName: string;
          tenantName: string;
          acceptUrl: string;
        };
        const c = renderInvitation({ inviterName, tenantName, acceptUrl, brand });
        await sendEmail(to, c.subject, c.html, c.text);
        break;
      }
      case "email.domain_verifying":
      case "email.domain_active": {
        const { hostname, adminEmail } = payload as { hostname: string; adminEmail?: string };
        const c = renderDomainActive({ hostname, brand });
        if (adminEmail) await sendEmail(adminEmail, c.subject, c.html, c.text);
        break;
      }
      case "email.domain_failed": {
        const { hostname, adminEmail, error } = payload as {
          hostname: string;
          adminEmail?: string;
          error: string;
        };
        const c = renderDomainFailed({ hostname, error, brand });
        if (adminEmail) await sendEmail(adminEmail, c.subject, c.html, c.text);
        break;
      }
      case "email.impersonation_notice": {
        const { to, adminEmail, reason, endsAt } = payload as {
          to: string;
          adminEmail: string;
          reason: string;
          endsAt: string;
        };
        const c = renderImpersonationNotice({ adminEmail, reason, endsAt: new Date(endsAt) });
        await sendEmail(to, c.subject, c.html, c.text);
        break;
      }
      default:
        logger.warn({ type: ev.type }, "unknown_outbox_type");
    }
    await db.update(outboxEvents).set({ dispatchedAt: new Date() }).where(eq(outboxEvents.id, ev.id));
  } catch (err) {
    await db
      .update(outboxEvents)
      .set({
        attempts: ev.attempts + 1,
        lastError: err instanceof Error ? err.message : String(err),
      })
      .where(eq(outboxEvents.id, ev.id));
    throw err;
  }
}

export function startOutboxWorker(): Worker {
  const worker = new Worker<OutboxJobPayload>(
    QUEUE_NAMES.outbox,
    async (job: Job<OutboxJobPayload>) => dispatchOne(job.data.eventId),
    { connection: redisConnection(), concurrency: 4 },
  );

  worker.on("failed", (job, err) => {
    logger.error({ eventId: job?.data.eventId, err: err.message }, "outbox_job_failed");
  });

  // Scan periódico: cada 30s encolar eventos que nunca entraron a BullMQ
  // (p.ej. si Redis cayó al insertar el evento en BD).
  const scan = async () => {
    try {
      const pending = await db
        .select({ id: outboxEvents.id })
        .from(outboxEvents)
        .where(and(isNull(outboxEvents.dispatchedAt)))
        .limit(50);
      for (const p of pending) {
        await outboxQueue().add(`event:${p.id}`, { eventId: p.id }, { jobId: p.id });
      }
    } catch (err) {
      logger.warn({ err: (err as Error).message }, "outbox_scan_failed");
    }
  };
  setInterval(scan, 30_000);
  return worker;
}
