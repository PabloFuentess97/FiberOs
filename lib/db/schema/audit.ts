import { pgTable, pgEnum, text, timestamp, uuid, jsonb, index } from "drizzle-orm/pg-core";

export const auditAction = pgEnum("audit_action", ["insert", "update", "delete"]);

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull(),
    userId: uuid("user_id"),
    actedAsBy: uuid("acted_as_by"),
    tableName: text("table_name").notNull(),
    recordId: uuid("record_id").notNull(),
    action: auditAction("action").notNull(),
    diff: jsonb("diff").notNull(),
    userAgent: text("user_agent"),
    // INET type lives in postgres; we store as text for Drizzle ergonomy and cast in SQL if needed.
    ipAddress: text("ip_address"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgCreatedIdx: index("audit_org_created_idx").on(t.organizationId, t.createdAt),
    recordIdx: index("audit_record_idx").on(t.tableName, t.recordId),
    userIdx: index("audit_user_idx").on(t.userId, t.createdAt),
  }),
);

export type AuditLogRow = typeof auditLog.$inferSelect;
