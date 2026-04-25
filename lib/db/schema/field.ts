import { pgTable, text, timestamp, uuid, jsonb, integer, index, unique } from "drizzle-orm/pg-core";
import { users } from "./auth";

export const fieldSyncQueue = pgTable(
  "field_sync_queue",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    deviceId: text("device_id").notNull(),
    clientUuid: uuid("client_uuid").notNull(),
    entity: text("entity").notNull(), // 'fusion' | 'box' | 'client'
    op: text("op").notNull(), // 'create' | 'update' | 'delete'
    payload: jsonb("payload").notNull(),
    // Version que el cliente tenía cuando hizo la mutación (null en create)
    clientVersion: integer("client_version"),
    status: text("status").notNull().default("pending"), // pending | applied | conflict | rejected
    appliedAt: timestamp("applied_at", { withTimezone: true }),
    appliedRecordId: uuid("applied_record_id"),
    conflictServerVersion: integer("conflict_server_version"),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    deviceClientUnique: unique("field_sync_device_client_unique").on(t.deviceId, t.clientUuid),
    statusIdx: index("field_sync_status_idx").on(t.organizationId, t.status, t.createdAt),
    userIdx: index("field_sync_user_idx").on(t.userId, t.createdAt),
  }),
);

export const files = pgTable(
  "files",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull(),
    storageKey: text("storage_key").notNull(), // key en R2/MinIO
    mime: text("mime").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    width: integer("width"),
    height: integer("height"),
    relatedTable: text("related_table"),
    relatedId: uuid("related_id"),
    visibility: text("visibility").notNull().default("private"),
    uploadedBy: uuid("uploaded_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    relatedIdx: index("files_related_idx").on(t.relatedTable, t.relatedId),
    orgIdx: index("files_org_idx").on(t.organizationId),
  }),
);

export type FieldSyncRow = typeof fieldSyncQueue.$inferSelect;
export type InsertFieldSyncRow = typeof fieldSyncQueue.$inferInsert;
export type FileRow = typeof files.$inferSelect;
