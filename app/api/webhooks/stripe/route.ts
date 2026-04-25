import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import type Stripe from "stripe";
import { db } from "@/lib/db";
import { stripeEvents, subscriptions, type SubscriptionStatus, type SubscriptionPlan } from "@/lib/db/schema/billing";
import { stripe } from "@/lib/billing/stripe";
import { logger } from "@/lib/observability/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Webhook Stripe. Idempotente: tabla `stripe_events.event_id` PK evita re-procesar.
 * Eventos gestionados:
 *   - customer.subscription.created|updated|deleted
 *   - invoice.paid / invoice.payment_failed (actualiza status)
 */
export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return new NextResponse("not_configured", { status: 500 });

  const sig = req.headers.get("stripe-signature");
  if (!sig) return new NextResponse("missing_signature", { status: 400 });

  const raw = await req.text();
  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(raw, sig, secret);
  } catch (err) {
    logger.warn({ err: (err as Error).message }, "stripe_webhook_bad_signature");
    return new NextResponse("bad_signature", { status: 400 });
  }

  // Idempotencia
  const [existing] = await db
    .select({ id: stripeEvents.eventId })
    .from(stripeEvents)
    .where(eq(stripeEvents.eventId, event.id))
    .limit(1);
  if (existing) return NextResponse.json({ ok: true, duplicate: true });

  await db.insert(stripeEvents).values({
    eventId: event.id,
    type: event.type,
    payload: event.data as unknown as Record<string, unknown>,
  });

  try {
    await handleEvent(event);
    await db
      .update(stripeEvents)
      .set({ processedAt: new Date() })
      .where(eq(stripeEvents.eventId, event.id));
    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error({ err, eventId: event.id }, "stripe_webhook_handle_failed");
    await db
      .update(stripeEvents)
      .set({ error: err instanceof Error ? err.message : String(err) })
      .where(eq(stripeEvents.eventId, event.id));
    // 200 para que Stripe no reintente indefinidamente; reprocess manual con CLI
    return NextResponse.json({ ok: false, error: "processing_failed" });
  }
}

async function handleEvent(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      await syncSubscription(sub);
      break;
    }
    case "invoice.paid": {
      const invoice = event.data.object as Stripe.Invoice;
      const subId = invoice.subscription as string | undefined;
      if (subId) {
        await db
          .update(subscriptions)
          .set({ status: "active" as SubscriptionStatus })
          .where(eq(subscriptions.stripeSubscriptionId, subId));
      }
      break;
    }
    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const subId = invoice.subscription as string | undefined;
      if (subId) {
        await db
          .update(subscriptions)
          .set({ status: "past_due" as SubscriptionStatus })
          .where(eq(subscriptions.stripeSubscriptionId, subId));
      }
      break;
    }
    default:
      // Otros eventos (payment_intent, etc) se ignoran por ahora
      logger.info({ type: event.type }, "stripe_event_ignored");
  }
}

async function syncSubscription(sub: Stripe.Subscription): Promise<void> {
  const planFromPrice = mapPriceToPlan(sub.items.data[0]?.price.id ?? "");
  const status = mapStripeStatus(sub.status);

  await db
    .update(subscriptions)
    .set({
      plan: planFromPrice,
      status,
      stripeSubscriptionId: sub.id,
      currentPeriodStartedAt: new Date(sub.current_period_start * 1000),
      currentPeriodEndsAt: new Date(sub.current_period_end * 1000),
      cancelledAt: sub.canceled_at ? new Date(sub.canceled_at * 1000) : null,
      trialEndsAt: sub.trial_end ? new Date(sub.trial_end * 1000) : null,
    })
    .where(eq(subscriptions.stripeCustomerId, sub.customer as string));
}

function mapPriceToPlan(priceId: string): SubscriptionPlan {
  if (priceId === process.env.STRIPE_PRICE_STARTER) return "starter";
  if (priceId === process.env.STRIPE_PRICE_PRO) return "pro";
  if (priceId === process.env.STRIPE_PRICE_BUSINESS) return "business";
  return "trial";
}

function mapStripeStatus(s: Stripe.Subscription.Status): SubscriptionStatus {
  switch (s) {
    case "trialing": return "trialing";
    case "active": return "active";
    case "past_due":
    case "unpaid": return "past_due";
    case "canceled": return "cancelled";
    case "paused": return "paused";
    default: return "active";
  }
}
