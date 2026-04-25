import ExcelJS from "exceljs";

export interface ParsedRow {
  rowNumber: number; // 1-based, 1 = header
  values: Record<string, unknown>;
}

export interface ParsedSheet {
  headers: string[];
  rows: ParsedRow[];
  totalRows: number; // sin contar header
}

/**
 * Lee la primera hoja de un Buffer XLSX en modo stream. Devuelve headers
 * y filas como `Record<header, value>`. Valores posibles: string, number,
 * Date o null.
 *
 * Para ficheros muy grandes consumir con `parseXlsxStream` generator en lugar
 * de cargar todo en memoria. El MVP soporta hasta ~10k filas en memoria sin
 * problema (2-3 MB).
 */
export async function parseXlsx(buffer: ArrayBuffer | Buffer): Promise<ParsedSheet> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as Buffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error("empty_workbook");

  const headerRow = sheet.getRow(1);
  const headers: string[] = [];
  headerRow.eachCell({ includeEmpty: false }, (cell, colNum) => {
    headers[colNum - 1] = normalizeHeader(cell.text ?? String(cell.value ?? ""));
  });

  const rows: ParsedRow[] = [];
  sheet.eachRow({ includeEmpty: false }, (row, rowNum) => {
    if (rowNum === 1) return;
    const values: Record<string, unknown> = {};
    headers.forEach((h, idx) => {
      const cell = row.getCell(idx + 1);
      values[h] = cellValue(cell);
    });
    rows.push({ rowNumber: rowNum, values });
  });

  return { headers, rows, totalRows: rows.length };
}

function normalizeHeader(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function cellValue(cell: ExcelJS.Cell): unknown {
  const v = cell.value;
  if (v == null) return null;
  if (v instanceof Date) return v;
  if (typeof v === "object" && "richText" in v && Array.isArray(v.richText)) {
    return v.richText.map((rt) => (rt as { text: string }).text).join("");
  }
  if (typeof v === "object" && "result" in v) return (v as { result: unknown }).result ?? null;
  if (typeof v === "object" && "text" in v) return (v as { text: string }).text;
  return v;
}

/** Versión CSV ligera — delegada si filename termina en .csv. */
export async function parseCsv(text: string): Promise<ParsedSheet> {
  const lines = text.replace(/\uFEFF/g, "").split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length === 0) return { headers: [], rows: [], totalRows: 0 };
  const headers = splitCsvLine(lines[0]!);
  const rows: ParsedRow[] = lines.slice(1).map((l, i) => {
    const cells = splitCsvLine(l);
    const values: Record<string, unknown> = {};
    headers.forEach((h, idx) => (values[h] = cells[idx] ?? null));
    return { rowNumber: i + 2, values };
  });
  return { headers, rows, totalRows: rows.length };
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        cur += c;
      }
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") {
        out.push(cur);
        cur = "";
      } else cur += c;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}
