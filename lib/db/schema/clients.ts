import {
  pgTable,
  pgEnum,
  text,
  timestamp,
  uuid,
  date,
  index,
  uniqueIndex,
  integer,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./auth";
import { organizations } from "./tenancy";
import { fibers, geographyPoint } from "./network";

export const clientStatus = pgEnum("client_status", [
  "active",
  "pending",
  "suspended",
  "cancelled",
]);

export const clients = pgTable(
  "clients",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    externalCode: text("external_code"),
    name: text("name").notNull(),
    documentId: text("document_id"),
    phone: text("phone"),
    email: text("email"),
    address: text("address").notNull(),
    location: geographyPoint("location"),
    ontSerial: text("ont_serial"),
    ontModel: text("ont_model"),
    dropFiberId: uuid("drop_fiber_id").references(() => fibers.id, { onDelete: "set null" }),
    status: clientStatus("status").notNull().default("pending"),
    installedAt: date("installed_at"),
    notes: text("notes"),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid("created_by").references(() => users.id),
    updatedBy: uuid("updated_by").references(() => users.id),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => ({
    activeIdx: index("clients_org_active_idx")
      .on(t.organizationId)
      .where(sql`${t.deletedAt} IS NULL`),
    // ONT serial único por org (entre clientes no eliminados)
    ontSerialUnique: uniqueIndex("clients_org_ont_serial_unique")
      .on(t.organizationId, t.ontSerial)
      .where(sql`${t.deletedAt} IS NULL AND ${t.ontSerial} IS NOT NULL`),
    // Código externo único por org (import) — deferrable en BD via SQL
    externalCodeUnique: uniqueIndex("clients_org_external_code_unique")
      .on(t.organizationId, t.externalCode)
      .where(sql`${t.deletedAt} IS NULL AND ${t.externalCode} IS NOT NULL`),
    // Una fibra de acometida no puede servir a más de un cliente activo
    oneClientPerDrop: uniqueIndex("clients_one_per_drop_fiber")
      .on(t.dropFiberId)
      .where(sql`${t.deletedAt} IS NULL AND ${t.dropFiberId} IS NOT NULL`),
  }),
);

export type Client = typeof clients.$inferSelect;
export type InsertClient = typeof clients.$inferInsert;
export type ClientStatus = (typeof clientStatus.enumValues)[number];
