import {
  pgTable,
  pgEnum,
  text,
  timestamp,
  boolean,
  uuid,
  primaryKey,
  index,
  uniqueIndex,
  integer,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./auth";

export const userRole = pgEnum("user_role", ["admin", "manager", "technician", "viewer"]);

export const domainStatus = pgEnum("domain_status", [
  "pending_dns",
  "verifying",
  "active",
  "failed",
  "disabled",
]);

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  country: text("country").notNull().default("ES"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const tenantSlugAliases = pgTable("tenant_slug_aliases", {
  slug: text("slug").primaryKey(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const organizationMembers = pgTable(
  "organization_members",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: userRole("role").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.organizationId, t.userId] }),
    userIdx: index("organization_members_user_idx").on(t.userId),
  }),
);

export const invitations = pgTable("invitations", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  role: userRole("role").notNull(),
  token: text("token").notNull().unique(),
  invitedBy: uuid("invited_by").references(() => users.id),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
});

export const tenantDomains = pgTable(
  "tenant_domains",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    hostname: text("hostname").notNull().unique(),
    isPrimary: boolean("is_primary").notNull().default(false),
    isSubdomain: boolean("is_subdomain").notNull(),
    status: domainStatus("status").notNull().default("pending_dns"),
    sslIssuedAt: timestamp("ssl_issued_at", { withTimezone: true }),
    sslExpiresAt: timestamp("ssl_expires_at", { withTimezone: true }),
    lastCheckAt: timestamp("last_check_at", { withTimezone: true }),
    lastCheckError: text("last_check_error"),
    verificationToken: text("verification_token"),
    cloudflareHostnameId: text("cloudflare_hostname_id"),
    checkCount: integer("check_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    hostnameIdx: index("tenant_domains_hostname_idx").on(t.hostname),
    orgIdx: index("tenant_domains_org_idx").on(t.organizationId),
    onePrimary: uniqueIndex("tenant_domains_one_primary_per_org")
      .on(t.organizationId)
      .where(sql`${t.isPrimary} = true`),
  }),
);

export const tenantBranding = pgTable("tenant_branding", {
  organizationId: uuid("organization_id")
    .primaryKey()
    .references(() => organizations.id, { onDelete: "cascade" }),
  displayName: text("display_name"),
  logoUrl: text("logo_url"),
  logoDarkUrl: text("logo_dark_url"),
  faviconUrl: text("favicon_url"),
  primaryColor: text("primary_color"),
  accentColor: text("accent_color"),
  emailFromName: text("email_from_name"),
  emailLogoUrl: text("email_logo_url"),
  supportEmail: text("support_email"),
  legalCompanyName: text("legal_company_name"),
  customCss: text("custom_css"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Organization = typeof organizations.$inferSelect;
export type InsertOrganization = typeof organizations.$inferInsert;
export type OrganizationMember = typeof organizationMembers.$inferSelect;
export type UserRole = (typeof userRole.enumValues)[number];
export type TenantDomain = typeof tenantDomains.$inferSelect;
export type TenantBranding = typeof tenantBranding.$inferSelect;
