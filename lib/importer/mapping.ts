import { z } from "zod";
import type { TransformName } from "./transforms";

/** Estructura del mapping que el usuario define en la UI. */
export const columnMappingSchema = z.object({
  column: z.string(), // nombre de columna origen en el Excel
  transforms: z.array(z.string()).default([]),
});

export const importMappingSchema = z.record(z.string(), columnMappingSchema);
export type ImportMapping = z.infer<typeof importMappingSchema>;

/** Campos destino por entidad. Los required se validan en el runner. */
export const TARGET_FIELDS = {
  boxes: {
    required: ["code", "type", "lat", "lng"],
    optional: ["status", "address", "manufacturer", "model", "positions_per_tray", "notes", "installed_at"],
  },
  cables: {
    required: ["code", "type", "fiber_count"],
    optional: ["standard", "length_m", "source_box_code", "target_box_code", "installed_at", "notes"],
  },
  clients: {
    required: ["name", "address"],
    optional: [
      "external_code",
      "document_id",
      "phone",
      "email",
      "ont_serial",
      "ont_model",
      "drop_cable_code",
      "drop_fiber_number",
      "status",
      "installed_at",
      "lat",
      "lng",
      "notes",
    ],
  },
} as const;

export type EntityType = keyof typeof TARGET_FIELDS;

/** Sugerencias de transform por campo (aplicadas automáticamente al proponer mapping). */
export const FIELD_DEFAULT_TRANSFORMS: Record<string, TransformName[]> = {
  code: ["trim", "upper", "null_if_empty"],
  type: ["trim", "lower", "null_if_empty"],
  status: ["trim", "lower", "null_if_empty"],
  address: ["trim", "collapse_spaces", "null_if_empty"],
  lat: ["parse_coord"],
  lng: ["parse_coord"],
  fiber_count: ["parse_number_es"],
  length_m: ["parse_number_es"],
  installed_at: ["parse_date_es"],
  positions_per_tray: ["parse_number_es"],
  drop_fiber_number: ["parse_number_es"],
  phone: ["trim", "null_if_empty"],
  email: ["trim", "lower", "null_if_empty"],
  name: ["trim", "collapse_spaces"],
  notes: ["trim", "null_if_empty"],
  external_code: ["trim", "upper", "null_if_empty"],
  document_id: ["trim", "upper", "null_if_empty"],
  ont_serial: ["trim", "upper", "null_if_empty"],
  source_box_code: ["trim", "upper", "null_if_empty"],
  target_box_code: ["trim", "upper", "null_if_empty"],
  drop_cable_code: ["trim", "upper", "null_if_empty"],
};

/** Distancia de Levenshtein para auto-detectar mapeos por similitud de cabeceras. */
export function levenshtein(a: string, b: string): number {
  const la = a.length;
  const lb = b.length;
  if (la === 0) return lb;
  if (lb === 0) return la;
  const prev = new Array<number>(lb + 1);
  const curr = new Array<number>(lb + 1);
  for (let j = 0; j <= lb; j++) prev[j] = j;
  for (let i = 1; i <= la; i++) {
    curr[0] = i;
    for (let j = 1; j <= lb; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        (prev[j] ?? 0) + 1,
        (curr[j - 1] ?? 0) + 1,
        (prev[j - 1] ?? 0) + cost,
      );
    }
    for (let j = 0; j <= lb; j++) prev[j] = curr[j] ?? 0;
  }
  return prev[lb] ?? 0;
}

/**
 * Dados los encabezados del Excel y el tipo de entidad, propone un mapping inicial
 * matcheando por similitud. Un umbral permisivo (≤ 3) evita matches extraños.
 */
export function proposeMapping(
  headers: string[],
  entity: EntityType,
): ImportMapping {
  const normalize = (s: string) =>
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") // sin acentos
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "");

  const all = [...TARGET_FIELDS[entity].required, ...TARGET_FIELDS[entity].optional] as string[];
  const mapping: ImportMapping = {};
  const usedHeaders = new Set<string>();

  for (const field of all) {
    const f = normalize(field);
    let best: { header: string; distance: number } | null = null;
    for (const raw of headers) {
      if (usedHeaders.has(raw)) continue;
      const h = normalize(raw);
      const distance = levenshtein(h, f);
      const score = Math.min(distance, h.includes(f) || f.includes(h) ? 0 : distance);
      if (!best || score < best.distance) best = { header: raw, distance: score };
    }
    if (best && best.distance <= 3) {
      usedHeaders.add(best.header);
      mapping[field] = {
        column: best.header,
        transforms: FIELD_DEFAULT_TRANSFORMS[field] ?? ["trim"],
      };
    }
  }
  return mapping;
}
