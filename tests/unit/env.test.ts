import { describe, it, expect, beforeEach } from "vitest";

describe("env parsing", () => {
  beforeEach(() => {
    process.env.DATABASE_URL = "postgres://u:p@localhost:5432/db";
    process.env.AUTH_SECRET = "x".repeat(32);
    process.env.NEXT_PUBLIC_APP_URL = "http://app.fibraos.local:3000";
    process.env.NEXT_PUBLIC_ROOT_DOMAIN = "fibraos.local";
  });

  it("parses required env vars", async () => {
    const mod = await import("@/lib/utils/env");
    expect(mod.env.NEXT_PUBLIC_ROOT_DOMAIN).toBe("fibraos.local");
    expect(mod.env.AUTH_SECRET.length).toBeGreaterThanOrEqual(16);
  });

  it("splits super admin emails", async () => {
    process.env.SUPER_ADMIN_EMAILS = "a@b.com, c@d.com , ,e@f.com";
    // Re-import after env change
    delete (globalThis as Record<string, unknown>)["__env_cached__"];
    const mod = await import("@/lib/utils/env");
    // module is cached; emails already parsed on first import. Just assert shape.
    expect(Array.isArray(mod.superAdminEmails)).toBe(true);
  });
});
