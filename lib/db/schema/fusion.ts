import {
  pgTable,
  pgEnum,
  text,
  timestamp,
  uuid,
  integer,
  numeric,
  index,
  unique,
  check,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./auth";
import { organizations } from "./tenancy";
import { boxes, trays, fibers } from "./network";

// ============ ENUMS ============
export const splitterRatio = pgEnum("splitter_ratio", [
  "1x2",
  "1x4",
  "1x8",
  "1x16",
  "1x32",
  "1x64",
]);

export const splitterPortKind = pgEnum("splitter_port_kind", ["input", "output"]);

export const fusionEndpointKind = pgEnum("fusion_endpoint_kind", ["fiber", "splitter_port"]);

// ============ SPLITTERS ============
export const splitters = pgTable(
  "splitters",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    boxId: uuid("box_id")
      .notNull()
      .references(() => boxes.id, { onDelete: "restrict" }),
    trayId: uuid("tray_id").references(() => trays.id, { onDelete: "set null" }),
    position: integer("position"),
    code: text("code").notNull(),
    ratio: splitterRatio("ratio").notNull(),
    insertionLossDb: numeric("insertion_loss_db", { precision: 4, scale: 2 }),
    notes: text("notes"),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid("created_by").references(() => users.id),
    updatedBy: uuid("updated_by").references(() => users.id),
  },
  (t) => ({
    codeUnique: unique("splitters_org_code_unique").on(t.organizationId, t.code),
    boxIdx: index("splitters_box_idx").on(t.boxId),
  }),
);

export const splitterPorts = pgTable(
  "splitter_ports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    splitterId: uuid("splitter_id")
      .notNull()
      .references(() => splitters.id, { onDelete: "cascade" }),
    kind: splitterPortKind("kind").notNull(),
    portNumber: integer("port_number").notNull(),
  },
  (t) => ({
    splitterIdx: index("splitter_ports_splitter_idx").on(t.splitterId),
    portUnique: unique("splitter_ports_unique").on(t.splitterId, t.kind, t.portNumber),
    portNonNegative: check("splitter_ports_port_non_negative", sql`${t.portNumber} >= 0`),
  }),
);

// ============ FUSIONS (simétricas) ============
export const fusions = pgTable(
  "fusions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    boxId: uuid("box_id")
      .notNull()
      .references(() => boxes.id, { onDelete: "restrict" }),
    trayId: uuid("tray_id").references(() => trays.id, { onDelete: "set null" }),
    position: integer("position"),

    endpointAKind: fusionEndpointKind("endpoint_a_kind").notNull(),
    endpointAFiberId: uuid("endpoint_a_fiber_id").references(() => fibers.id, {
      onDelete: "restrict",
    }),
    endpointASplitterPortId: uuid("endpoint_a_splitter_port_id").references(
      () => splitterPorts.id,
      { onDelete: "restrict" },
    ),

    endpointBKind: fusionEndpointKind("endpoint_b_kind").notNull(),
    endpointBFiberId: uuid("endpoint_b_fiber_id").references(() => fibers.id, {
      onDelete: "restrict",
    }),
    endpointBSplitterPortId: uuid("endpoint_b_splitter_port_id").references(
      () => splitterPorts.id,
      { onDelete: "restrict" },
    ),

    lossDb: numeric("loss_db", { precision: 4, scale: 2 }),
    photoFileId: uuid("photo_file_id"),
    technicianId: uuid("technician_id").references(() => users.id),
    fusedAt: timestamp("fused_at", { withTimezone: true }).notNull().defaultNow(),
    notes: text("notes"),
    version: integer("version").notNull().default(1),
  },
  (t) => ({
    boxIdx: index("fusions_box_idx").on(t.boxId),
    aFiberIdx: index("fusions_a_fiber_idx").on(t.endpointAFiberId),
    bFiberIdx: index("fusions_b_fiber_idx").on(t.endpointBFiberId),
    aPortIdx: index("fusions_a_port_idx").on(t.endpointASplitterPortId),
    bPortIdx: index("fusions_b_port_idx").on(t.endpointBSplitterPortId),
    endpointAShape: check(
      "fusions_endpoint_a_shape",
      sql`
        (${t.endpointAKind} = 'fiber' AND ${t.endpointAFiberId} IS NOT NULL AND ${t.endpointASplitterPortId} IS NULL)
        OR
        (${t.endpointAKind} = 'splitter_port' AND ${t.endpointASplitterPortId} IS NOT NULL AND ${t.endpointAFiberId} IS NULL)
      `,
    ),
    endpointBShape: check(
      "fusions_endpoint_b_shape",
      sql`
        (${t.endpointBKind} = 'fiber' AND ${t.endpointBFiberId} IS NOT NULL AND ${t.endpointBSplitterPortId} IS NULL)
        OR
        (${t.endpointBKind} = 'splitter_port' AND ${t.endpointBSplitterPortId} IS NOT NULL AND ${t.endpointBFiberId} IS NULL)
      `,
    ),
    noSelfFiber: check(
      "fusions_no_self_fiber",
      sql`${t.endpointAFiberId} IS DISTINCT FROM ${t.endpointBFiberId} OR ${t.endpointAFiberId} IS NULL`,
    ),
    noSelfPort: check(
      "fusions_no_self_port",
      sql`${t.endpointASplitterPortId} IS DISTINCT FROM ${t.endpointBSplitterPortId} OR ${t.endpointASplitterPortId} IS NULL`,
    ),
  }),
);

/**
 * Tabla desnormalizada (una fila por endpoint) mantenida por trigger.
 * El UNIQUE sobre fiber_id / splitter_port_id garantiza que un endpoint
 * no pueda fusionarse dos veces.
 */
export const fusionEndpoints = pgTable(
  "fusion_endpoints",
  {
    fusionId: uuid("fusion_id")
      .notNull()
      .references(() => fusions.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id").notNull(),
    kind: fusionEndpointKind("kind").notNull(),
    fiberId: uuid("fiber_id"),
    splitterPortId: uuid("splitter_port_id"),
  },
  (t) => ({
    // PK compuesta (fusionId, kind, fiberId, splitterPortId) — Drizzle exige pk explicit
    pk: uniqueIndex("fusion_endpoints_pk").on(t.fusionId, t.kind, t.fiberId, t.splitterPortId),
    fiberUnique: uniqueIndex("fusion_endpoints_fiber_unique")
      .on(t.fiberId)
      .where(sql`${t.fiberId} IS NOT NULL`),
    portUnique: uniqueIndex("fusion_endpoints_port_unique")
      .on(t.splitterPortId)
      .where(sql`${t.splitterPortId} IS NOT NULL`),
    shapeCheck: check(
      "fusion_endpoints_shape",
      sql`
        (${t.kind} = 'fiber' AND ${t.fiberId} IS NOT NULL AND ${t.splitterPortId} IS NULL)
        OR
        (${t.kind} = 'splitter_port' AND ${t.splitterPortId} IS NOT NULL AND ${t.fiberId} IS NULL)
      `,
    ),
  }),
);

export type Splitter = typeof splitters.$inferSelect;
export type InsertSplitter = typeof splitters.$inferInsert;
export type SplitterPort = typeof splitterPorts.$inferSelect;
export type Fusion = typeof fusions.$inferSelect;
export type InsertFusion = typeof fusions.$inferInsert;
export type FusionEndpoint = typeof fusionEndpoints.$inferSelect;
export type SplitterRatio = (typeof splitterRatio.enumValues)[number];
export type FusionEndpointKind = (typeof fusionEndpointKind.enumValues)[number];
