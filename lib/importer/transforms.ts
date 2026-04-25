/**
 * Transformaciones puras aplicables a cada celda durante el import.
 * Todas devuelven `string | number | null` según el caso; el validator
 * posterior convierte al tipo de la columna destino.
 */

export type TransformName =
  | "trim"
  | "upper"
  | "lower"
  | "null_if_empty"
  | "parse_number_es"
  | "parse_coord"
  | "parse_date_es"
  | "collapse_spaces";

export type TransformFn = (value: unknown) => unknown;

function asString(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (v instanceof Date) return v.toISOString();
  return String(v);
}

export const TRANSFORMS: Record<TransformName, TransformFn> = {
  trim: (v) => (typeof v === "string" ? v.trim() : v),
  upper: (v) => (typeof v === "string" ? v.toUpperCase() : v),
  lower: (v) => (typeof v === "string" ? v.toLowerCase() : v),
  null_if_empty: (v) => {
    if (v == null) return null;
    if (typeof v === "string" && v.trim() === "") return null;
    return v;
  },
  collapse_spaces: (v) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim() : v),
  parse_number_es: (v) => {
    if (v == null || v === "") return null;
    if (typeof v === "number") return v;
    const s = asString(v).trim().replace(/\./g, "").replace(",", ".");
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  },
  parse_coord: (v) => {
    // Acepta "37.1773", "37,1773", "37° 10' 38.2\" N"
    if (v == null || v === "") return null;
    if (typeof v === "number") return v;
    const s = asString(v).trim();
    // DMS: 37° 10' 38.2" N
    const dms = /^(-?\d+)[°º]\s*(\d+)['′]\s*([\d.,]+)["″]?\s*([NSEW])?$/i.exec(s);
    if (dms?.[1] && dms[2] && dms[3]) {
      const deg = Number(dms[1]);
      const min = Number(dms[2]);
      const sec = Number(dms[3].replace(",", "."));
      let dec = Math.abs(deg) + min / 60 + sec / 3600;
      if (deg < 0 || /[SW]/i.test(dms[4] ?? "")) dec = -dec;
      return dec;
    }
    // Decimal con coma o punto
    const n = Number(s.replace(",", "."));
    return Number.isFinite(n) ? n : null;
  },
  parse_date_es: (v) => {
    if (v == null || v === "") return null;
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    const s = asString(v).trim();
    // dd/mm/yyyy o dd-mm-yyyy
    const m = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/.exec(s);
    if (m?.[1] && m[2] && m[3]) {
      const d = Number(m[1]);
      const mo = Number(m[2]);
      let y = Number(m[3]);
      if (y < 100) y += 2000;
      if (d >= 1 && d <= 31 && mo >= 1 && mo <= 12) {
        return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      }
    }
    // ISO nativo
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    return null;
  },
};

/** Aplica una cadena de transforms en orden. Propaga nulls sin ejecutar las siguientes. */
export function applyTransforms(value: unknown, transforms: TransformName[] = []): unknown {
  let v = value;
  for (const name of transforms) {
    const fn = TRANSFORMS[name];
    if (!fn) continue;
    v = fn(v);
    // null_if_empty puede convertir a null; detenemos para evitar .trim() en null
    if (v == null) return null;
  }
  return v;
}
