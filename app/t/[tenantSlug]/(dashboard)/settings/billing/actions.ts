"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireTenantContext } from "@/lib/tenancy/guards";
import { db } from "@/lib/db";
import { subscriptions } from "@/lib/db/schema/billing";
import { organizations } from "@/lib/db/schema/tenancy";
import { stripe, priceIdForPlan } from "@/lib/billing/stripe";

async function ensureCustomer(organizationId: string): Promise<string> {
  const [sub] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.organizationId, organizationId))
    .limit(1);
  if (sub?.stripeCustomerId) return sub.stripeCustomerId;

  const [org] = await db
    .select({ name: organizations.name, slug: organizations.slug })
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);
  if (!org) throw new Error("org_not_found");

  const customer = await stripe().customers.create({
    name: org.name,
    metadata: { organization_id: organizationId, slug: org.slug },
  });

  if (sub) {
    await db
      .update(subscriptions)
      .set({ stripeCustomerId: customer.id })
      .where(eq(subscriptions.organizationId, organizationId));
  } else {
    await db.insert(subscriptions).values({
      organizationId,
      plan: "trial",
      status: "trialing",
      trialEndsAt: new Date(Date.now() + 14 * 24 * 3600_000),
      stripeCustomerId: customer.id,
    });
  }
  return customer.id;
}

const checkoutSchema = z.object({
  plan: z.enum(["starter", "pro", "business"]),
});

export async function startCheckoutAction(formData: FormData): Promise<void> {
  const ctx = await requireTenantContext();
  if (!ctx || ctx.role !== "admin") throw new Error("forbidden");
  const { plan } = checkoutSchema.parse({ plan: formData.get("plan") });

  const customerId = await ensureCustomer(ctx.organizationId);
  const priceId = priceIdForPlan(plan);
  const root = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "fibraos.com";
  const scheme = process.env.NODE_ENV === "production" ? "https" : "http";
  const port = process.env.NODE_ENV === "production" ? "" : ":3000";
  const baseUrl = `${scheme}://${ctx.organizationSlug}.${root}${port}`;

  const session = await stripe().checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${baseUrl}/settings/billing?upgrade=ok`,
    cancel_url: `${baseUrl}/settings/billing?upgrade=cancelled`,
    subscription_data: { metadata: { organization_id: ctx.organizationId } },
    allow_promotion_codes: true,
  });
  if (!session.url) throw new Error("no_session_url");
  redirect(session.url);
}

export async function openPortalAction(): Promise<void> {
  const ctx = await requireTenantContext();
  if (!ctx || ctx.role !== "admin") throw new Error("forbidden");

  const customerId = await ensureCustomer(ctx.organizationId);
  const root = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "fibraos.com";
  const scheme = process.env.NODE_ENV === "production" ? "https" : "http";
  const port = process.env.NODE_ENV === "production" ? "" : ":3000";
  const returnUrl = `${scheme}://${ctx.organizationSlug}.${root}${port}/settings/billing`;

  const portal = await stripe().billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl,
  });
  redirect(portal.url);
}
