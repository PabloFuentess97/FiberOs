import { pgTable, pgEnum, text, timestamp, uuid, integer, jsonb, index } from "drizzle-orm/pg-core";
import { organizations } from "./tenancy";
import { users } from "./auth";

export const subscriptionPlan = pgEnum("subscription_plan", [
  "trial",
  "starter",
  "pro",
  "business",
  "enterprise",
]);

export const subscriptionStatus = pgEnum("subscription_status", [
  "trialing",
  "active",
  "past_due",
  "cancelled",
  "paused",
]);

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    plan: subscriptionPlan("plan").notNull().default("trial"),
    status: subscriptionStatus("status").notNull().default("trialing"),
    trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
    currentPeriodStartedAt: timestamp("current_period_started_at", { withTimezone: true }),
    currentPeriodEndsAt: timestamp("current_period_ends_at", { withTimezone: true }),
    clientCountLimit: integer("client_count_limit"),
    userCountLimit: integer("user_count_limit"),
    customDomainLimit: integer("custom_domain_limit").notNull().default(0),
    stripeCustomerId: text("stripe_customer_id").unique(),
    stripeSubscriptionId: text("stripe_subscription_id").unique(),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ orgIdx: index("subscriptions_org_idx").on(t.organizationId) }),
);

export const planQuotas = pgTable("plan_quotas", {
  plan: subscriptionPlan("plan").primaryKey(),
  clientLimit: integer("client_limit"),
  userLimit: integer("user_limit"),
  customDomainLimit: integer("custom_domain_limit").notNull().default(0),
  apiRatePerMinute: integer("api_rate_per_minute").notNull().default(60),
  importRowsPerJob: integer("import_rows_per_job").notNull().default(10000),
});

export const stripeEvents = pgTable("stripe_events", {
  eventId: text("event_id").primaryKey(),
  type: text("type").notNull(),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  processedAt: timestamp("processed_at", { withTimezone: true }),
  payload: jsonb("payload").notNull(),
  error: text("error"),
});

export const outboxEvents = pgTable(
  "outbox_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id"),
    type: text("type").notNull(),
    payload: jsonb("payload").notNull(),
    dispatchedAt: timestamp("dispatched_at", { withTimezone: true }),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pendingIdx: index("outbox_pending_idx")
      .on(t.createdAt)
      .where(t.dispatchedAt.isNull()),
  }),
);

export const impersonations = pgTable(
  "impersonations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorUserId: uuid("actor_user_id")
      .notNull()
      .references(() => users.id),
    targetUserId: uuid("target_user_id")
      .notNull()
      .references(() => users.id),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    reason: text("reason").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
  },
  (t) => ({ actorIdx: index("impersonations_actor_idx").on(t.actorUserId, t.startedAt) }),
);

export type Subscription = typeof subscriptions.$inferSelect;
export type SubscriptionPlan = (typeof subscriptionPlan.enumValues)[number];
export type SubscriptionStatus = (typeof subscriptionStatus.enumValues)[number];
export type OutboxEvent = typeof outboxEvents.$inferSelect;
export type Impersonation = typeof impersonations.$inferSelect;
