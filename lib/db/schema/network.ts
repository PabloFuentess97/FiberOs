import {
  pgTable,
  pgEnum,
  text,
  timestamp,
  uuid,
  integer,
  numeric,
  date,
  index,
  uniqueIndex,
  unique,
  check,
  customType,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./auth";
import { organizations } from "./tenancy";

// ============ Custom types para PostGIS ============
// Guardamos geography como texto WKT al hacer select/insert; PostGIS convierte.
// Para inserts usamos sql`ST_GeographyFromText(...)` directamente.
export const geographyPoint = customType<{ data: string; driverData: string }>({
  dataType() {
    return "geography(Point, 4326)";
  },
});

export const geographyLineString = customType<{ data: string; driverData: string }>({
  dataType() {
    return "geography(LineString, 4326)";
  },
});

// ============ ENUMS ============
export const boxType = pgEnum("box_type", [
  "olt_headend",
  "main_trunk",
  "trunk",
  "subtrunk",
  "cto",
  "manhole",
  "splice_closure",
  "pole",
]);

export const boxStatus = pgEnum("box_status", [
  "active",
  "planned",
  "decommissioned",
  "damaged",
]);

export const cableType = pgEnum("cable_type", [
  "main_trunk",
  "trunk",
  "subtrunk",
  "drop",
]);

export const fiberStandard = pgEnum("fiber_standard", [
  "G652D",
  "G657A1",
  "G657A2",
  "G657B3",
  "G655",
]);

export const fiberColor = pgEnum("fiber_color", [
  "blue",
  "orange",
  "green",
  "brown",
  "slate",
  "white",
  "red",
  "black",
  "yellow",
  "violet",
  "rose",
  "aqua",
]);

export const fiberStatus = pgEnum("fiber_status", [
  "free",
  "fused",
  "reserved",
  "damaged",
]);

// ============ TABLES ============
export const boxes = pgTable(
  "boxes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    shortId: text("short_id").notNull(), // 8 chars [A-Z0-9]
    type: boxType("type").notNull(),
    status: boxStatus("status").notNull().default("active"),
    manufacturer: text("manufacturer"),
    model: text("model"),
    positionsPerTray: integer("positions_per_tray").notNull().default(12),
    location: geographyPoint("location").notNull(),
    address: text("address"),
    notes: text("notes"),
    installedAt: date("installed_at"),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid("created_by").references(() => users.id),
    updatedBy: uuid("updated_by").references(() => users.id),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => ({
    codeUnique: unique("boxes_org_code_unique").on(t.organizationId, t.code),
    shortIdUnique: unique("boxes_org_short_id_unique").on(t.organizationId, t.shortId),
    activeIdx: index("boxes_org_active_idx")
      .on(t.organizationId)
      .where(sql`${t.deletedAt} IS NULL`),
    typeIdx: index("boxes_type_idx").on(t.organizationId, t.type),
  }),
);

export const trays = pgTable(
  "trays",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    boxId: uuid("box_id")
      .notNull()
      .references(() => boxes.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    capacity: integer("capacity").notNull().default(12),
    notes: text("notes"),
  },
  (t) => ({
    boxIdx: index("trays_box_idx").on(t.boxId),
    boxNumberUnique: unique("trays_box_number_unique").on(t.boxId, t.number),
    numberPositive: check("trays_number_positive", sql`${t.number} > 0`),
    capacityPositive: check("trays_capacity_positive", sql`${t.capacity} > 0`),
  }),
);

export const cables = pgTable(
  "cables",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    type: cableType("type").notNull(),
    standard: fiberStandard("standard").notNull().default("G657A2"),
    fiberCount: integer("fiber_count").notNull(),
    lengthM: numeric("length_m", { precision: 10, scale: 2 }),
    sourceBoxId: uuid("source_box_id").references(() => boxes.id),
    targetBoxId: uuid("target_box_id").references(() => boxes.id),
    path: geographyLineString("path"),
    installedAt: date("installed_at"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid("created_by").references(() => users.id),
    updatedBy: uuid("updated_by").references(() => users.id),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => ({
    codeUnique: unique("cables_org_code_unique").on(t.organizationId, t.code),
    activeIdx: index("cables_org_active_idx")
      .on(t.organizationId)
      .where(sql`${t.deletedAt} IS NULL`),
    sourceIdx: index("cables_source_idx").on(t.sourceBoxId),
    targetIdx: index("cables_target_idx").on(t.targetBoxId),
    fiberCountRange: check(
      "cables_fiber_count_range",
      sql`${t.fiberCount} > 0 AND ${t.fiberCount} <= 288`,
    ),
    distinctEndpoints: check(
      "cables_distinct_endpoints",
      sql`${t.sourceBoxId} IS NULL OR ${t.targetBoxId} IS NULL OR ${t.sourceBoxId} <> ${t.targetBoxId}`,
    ),
    lengthNonNegative: check(
      "cables_length_non_negative",
      sql`${t.lengthM} IS NULL OR ${t.lengthM} >= 0`,
    ),
  }),
);

export const fibers = pgTable(
  "fibers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    cableId: uuid("cable_id")
      .notNull()
      .references(() => cables.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    color: fiberColor("color").notNull(),
    status: fiberStatus("status").notNull().default("free"),
    notes: text("notes"),
  },
  (t) => ({
    cableIdx: index("fibers_cable_idx").on(t.cableId),
    statusIdx: index("fibers_status_idx").on(t.organizationId, t.status),
    cableNumberUnique: uniqueIndex("fibers_cable_number_unique").on(t.cableId, t.number),
    numberPositive: check("fibers_number_positive", sql`${t.number} > 0`),
  }),
);

export type Box = typeof boxes.$inferSelect;
export type InsertBox = typeof boxes.$inferInsert;
export type Cable = typeof cables.$inferSelect;
export type InsertCable = typeof cables.$inferInsert;
export type Fiber = typeof fibers.$inferSelect;
export type Tray = typeof trays.$inferSelect;
export type BoxType = (typeof boxType.enumValues)[number];
export type BoxStatus = (typeof boxStatus.enumValues)[number];
export type CableType = (typeof cableType.enumValues)[number];
export type FiberColor = (typeof fiberColor.enumValues)[number];
export type FiberStatus = (typeof fiberStatus.enumValues)[number];
