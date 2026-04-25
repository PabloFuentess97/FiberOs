/**
 * Genera `tmdigital-sample.xlsx` con 500 filas (realistas + 12 intencionalmente rotas).
 * Ejecutar: `pnpm tsx tests/fixtures/generate-sample.ts`
 *
 * No se incluye el binario en el repo (flaky en code review); se regenera en CI
 * mediante esta utility cuando los tests E2E lo necesiten.
 */
import ExcelJS from "exceljs";
import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

async function main() {
  const wb = new ExcelJS.Workbook();
  const sh = wb.addWorksheet("Cajas");
  sh.addRow([
    "Código",
    "Tipo",
    "Estado",
    "Dirección",
    "Fabricante",
    "Modelo",
    "Latitud",
    "Longitud",
    "Posiciones",
    "Fecha instalación",
    "Observaciones",
  ]);

  const types = ["cto", "trunk", "subtrunk", "manhole", "splice_closure"];
  const baseLat = 37.1773;
  const baseLng = -3.5986;

  // 488 filas válidas
  for (let i = 1; i <= 488; i++) {
    const type = types[i % types.length]!;
    sh.addRow([
      `CTO-IMP-${String(i).padStart(4, "0")}`,
      type,
      "active",
      `Calle Import ${i}, Granada`,
      "Huawei",
      "MDU-8",
      baseLat + (Math.random() - 0.5) * 0.02,
      baseLng + (Math.random() - 0.5) * 0.02,
      12,
      "15/03/2025",
      "",
    ]);
  }

  // 12 filas con errores intencionales
  sh.addRow(["", "cto", "active", "Sin código", "Huawei", "", 37.1773, -3.5986, 12, "", ""]); // code vacío
  sh.addRow(["CTO-BAD-1", "tipo-inexistente", "active", "Tipo raro", "", "", 37.1773, -3.5986, 12, "", ""]);
  sh.addRow(["CTO-BAD-2", "cto", "active", "Coord fuera rango", "", "", 95, -3.5986, 12, "", ""]);
  sh.addRow(["CTO-BAD-3", "cto", "active", "Coord texto", "", "", "abc", "def", 12, "", ""]);
  sh.addRow(["CTO-BAD-4", "", "active", "Sin tipo", "", "", 37.1773, -3.5986, 12, "", ""]);
  sh.addRow(["CTO-BAD-5", "cto", "active", "Fecha mala", "", "", 37.1773, -3.5986, 12, "31/02/2025", ""]);
  sh.addRow(["CTO-BAD-6", "cto", "weird-status", "Estado raro", "", "", 37.1773, -3.5986, 12, "", ""]);
  sh.addRow(["CTO-BAD-7", "cto", "active", "", "", "", 37.1773, -3.5986, 12, "", ""]); // address requerido
  sh.addRow([
    "CTO-IMP-0001",
    "cto",
    "active",
    "Duplicado del primero — genera update, no error",
    "",
    "",
    37.1774,
    -3.5985,
    12,
    "",
    "",
  ]);
  sh.addRow(["CTO-BAD-8", "cto", "active", "Pos inválida", "", "", 37.1773, -3.5986, -1, "", ""]);
  sh.addRow(["CTO-BAD-9", "cto", "active", "Pos enorme", "", "", 37.1773, -3.5986, 500, "", ""]);
  sh.addRow(["CTO-BAD-10", "cto", "active", "Coord DMS mal formada", "", "", "37° 1000' 0\"", -3.5986, 12, "", ""]);

  const out = join(HERE, "tmdigital-sample.xlsx");
  const buf = await wb.xlsx.writeBuffer();
  writeFileSync(out, Buffer.from(buf));
  console.log(`✓ ${out} generado (${488 + 12} filas)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
