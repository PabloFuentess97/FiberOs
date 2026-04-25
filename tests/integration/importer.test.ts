import { describe, it, expect, beforeAll, afterAll } from "vitest";
import ExcelJS from "exceljs";
import { eq, and, isNull, count } from "drizzle-orm";
import { startTestStack, type TestStack } from "./setup/containers";
import { runImport } from "@/lib/importer/runner";
import { boxes } from "@/lib/db/schema/network";
import { importJobs } from "@/lib/db/schema/imports";

/**
 * Flujo 2: import end-to-end contra Postgres+PostGIS real.
 * Genera un XLSX en memoria y lo ejecuta por el runner.
 */
describe("Import runner (integration)", () => {
  let stack: TestStack;
  let organizationId: string;
  let userId: string;

  beforeAll(async () => {
    stack = await startTestStack();
    const [org] = await stack.client<{ id: string }[]>`
      INSERT INTO organizations (name, slug, country) VALUES ('Imp Org', 'imp', 'ES') RETURNING id
    `;
    organizationId = org!.id;
    const [u] = await stack.client<{ id: string }[]>`
      INSERT INTO users (email, email_verified_at) VALUES ('imp@test.local', now()) RETURNING id
    `;
    userId = u!.id;
    await stack.client`
      INSERT INTO organization_members (organization_id, user_id, role)
      VALUES (${organizationId}, ${userId}, 'admin')
    `;
    await stack.client`INSERT INTO subscriptions (organization_id, plan, status)
                       VALUES (${organizationId}, 'pro', 'active')`;
  }, 120_000);

  afterAll(async () => {
    await stack?.stop();
  });

  async function makeFixture(validRows: number, badRows: number): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    const sh = wb.addWorksheet("Cajas");
    sh.addRow(["Código", "Tipo", "Estado", "Dirección", "Latitud", "Longitud"]);
    for (let i = 1; i <= validRows; i++) {
      sh.addRow([`IMP-${String(i).padStart(4, "0")}`, "cto", "active", `Calle ${i}`, 37.1773, -3.5986]);
    }
    // errores intencionales
    if (badRows > 0) sh.addRow(["", "cto", "active", "sin code", 37, -3]);
    if (badRows > 1) sh.addRow(["BAD-2", "inexistente", "active", "tipo malo", 37, -3]);
    if (badRows > 2) sh.addRow(["BAD-3", "cto", "active", "coord rango", 95, -3]);
    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  it("dry-run no escribe en BD", async () => {
    const buf = await makeFixture(5, 2);

    const [job] = await stack.client<{ id: string }[]>`
      INSERT INTO import_jobs (organization_id, user_id, entity_type, mapping, dry_run)
      VALUES (${organizationId}, ${userId}, 'boxes', '{}'::jsonb, true)
      RETURNING id
    `;

    const result = await runImport({
      jobId: job!.id,
      organizationId,
      userId,
      entityType: "boxes",
      mapping: {
        code: { column: "Código", transforms: ["trim", "upper"] },
        type: { column: "Tipo", transforms: ["trim", "lower"] },
        status: { column: "Estado", transforms: ["trim", "lower"] },
        address: { column: "Dirección", transforms: ["trim"] },
        lat: { column: "Latitud", transforms: ["parse_coord"] },
        lng: { column: "Longitud", transforms: ["parse_coord"] },
      },
      dryRun: true,
      fileBuffer: buf,
      filename: "test.xlsx",
    });

    expect(result.totalRows).toBe(7);
    expect(result.errorRows).toBe(2);

    // Dry-run → BD no debe tener filas nuevas
    const [rowCount] = await stack.db
      .select({ n: count() })
      .from(boxes)
      .where(and(eq(boxes.organizationId, organizationId), isNull(boxes.deletedAt)));
    expect(rowCount?.n).toBe(0);
  });

  it("ejecución real crea 5 cajas y reporta 2 errores", async () => {
    const buf = await makeFixture(5, 2);
    const [job] = await stack.client<{ id: string }[]>`
      INSERT INTO import_jobs (organization_id, user_id, entity_type, mapping, dry_run)
      VALUES (${organizationId}, ${userId}, 'boxes', '{}'::jsonb, false)
      RETURNING id
    `;

    const result = await runImport({
      jobId: job!.id,
      organizationId,
      userId,
      entityType: "boxes",
      mapping: {
        code: { column: "Código", transforms: ["trim", "upper"] },
        type: { column: "Tipo", transforms: ["trim", "lower"] },
        status: { column: "Estado", transforms: ["trim", "lower"] },
        address: { column: "Dirección", transforms: ["trim"] },
        lat: { column: "Latitud", transforms: ["parse_coord"] },
        lng: { column: "Longitud", transforms: ["parse_coord"] },
      },
      dryRun: false,
      fileBuffer: buf,
      filename: "test.xlsx",
    });

    expect(result.createdRows).toBe(5);
    expect(result.errorRows).toBe(2);
    expect(result.errors.every((e) => e.reason)).toBe(true);

    // Verificar en BD
    const [rowCount] = await stack.db
      .select({ n: count() })
      .from(boxes)
      .where(and(eq(boxes.organizationId, organizationId), isNull(boxes.deletedAt)));
    expect(rowCount?.n).toBe(5);

    // Job queda con status 'partial' (hay errores pero no todos)
    const [jobRow] = await stack.db
      .select()
      .from(importJobs)
      .where(eq(importJobs.id, job!.id));
    expect(jobRow?.status).toBe("partial");
  });

  it("re-importar el mismo Excel actualiza en lugar de duplicar (idempotencia por code)", async () => {
    const buf = await makeFixture(5, 0); // 5 filas válidas, sin errores
    const [job] = await stack.client<{ id: string }[]>`
      INSERT INTO import_jobs (organization_id, user_id, entity_type, mapping, dry_run)
      VALUES (${organizationId}, ${userId}, 'boxes', '{}'::jsonb, false)
      RETURNING id
    `;

    const result = await runImport({
      jobId: job!.id,
      organizationId,
      userId,
      entityType: "boxes",
      mapping: {
        code: { column: "Código", transforms: ["trim", "upper"] },
        type: { column: "Tipo", transforms: ["trim", "lower"] },
        status: { column: "Estado", transforms: ["trim", "lower"] },
        address: { column: "Dirección", transforms: ["trim"] },
        lat: { column: "Latitud", transforms: ["parse_coord"] },
        lng: { column: "Longitud", transforms: ["parse_coord"] },
      },
      dryRun: false,
      fileBuffer: buf,
      filename: "test.xlsx",
    });

    // Los 5 codes ya existen del test anterior → update, no create
    expect(result.createdRows).toBe(0);
    expect(result.updatedRows).toBe(5);
  });
});
