import { pgTable, text, timestamp, uuid, jsonb, integer, boolean, index } from "drizzle-orm/pg-core";
import { users } from "./auth";
import { organizations } from "./tenancy";
import { files } from "./field";

export const importJobs = pgTable(
  "import_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    sourceFileId: uuid("source_file_id").references(() => files.id),
    sourceFilename: text("source_filename"),
    entityType: text("entity_type").notNull(), // boxes | cables | clients | mixed
    mapping: jsonb("mapping").notNull(), // { [targetField]: { column, transforms[] } }
    dryRun: boolean("dry_run").notNull().default(false),
    status: text("status").notNull().default("pending"), // pending | running | ok | failed | partial
    totalRows: integer("total_rows"),
    processedRows: integer("processed_rows"),
    createdRows: integer("created_rows"),
    updatedRows: integer("updated_rows"),
    errorRows: integer("error_rows"),
    errors: jsonb("errors"), // [{ row, reason, values }]
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("import_jobs_org_idx").on(t.organizationId, t.createdAt),
    statusIdx: index("import_jobs_status_idx").on(t.status, t.createdAt),
  }),
);

export type ImportJob = typeof importJobs.$inferSelect;
export type InsertImportJob = typeof importJobs.$inferInsert;
