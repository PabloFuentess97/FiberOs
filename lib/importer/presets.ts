import type { ImportMapping } from "./mapping";
import type { EntityType } from "./validators";

export interface ImportPreset {
  id: string;
  name: string;
  description: string;
  entityType: EntityType;
  mapping: ImportMapping;
}

/**
 * Plantillas para el cliente piloto TMDigital (§3). Cubren los exports típicos
 * de su Excel "inventario.xlsx". Los admins pueden duplicarlas y adaptarlas.
 */
export const TMDIGITAL_PRESETS: ImportPreset[] = [
  {
    id: "tmdigital-boxes",
    name: "TMDigital · Cajas",
    description: "Inventario de cajas (CTOs, troncales, arquetas) desde su Excel histórico.",
    entityType: "boxes",
    mapping: {
      code: { column: "Código", transforms: ["trim", "upper", "null_if_empty"] },
      type: { column: "Tipo", transforms: ["trim", "lower", "null_if_empty"] },
      status: { column: "Estado", transforms: ["trim", "lower", "null_if_empty"] },
      address: { column: "Dirección", transforms: ["trim", "collapse_spaces", "null_if_empty"] },
      manufacturer: { column: "Fabricante", transforms: ["trim", "null_if_empty"] },
      model: { column: "Modelo", transforms: ["trim", "null_if_empty"] },
      lat: { column: "Latitud", transforms: ["parse_coord"] },
      lng: { column: "Longitud", transforms: ["parse_coord"] },
      positions_per_tray: { column: "Posiciones", transforms: ["parse_number_es"] },
      installed_at: { column: "Fecha instalación", transforms: ["parse_date_es"] },
      notes: { column: "Observaciones", transforms: ["trim", "null_if_empty"] },
    },
  },
  {
    id: "tmdigital-cables",
    name: "TMDigital · Cables",
    description: "Cables ópticos con origen/destino por código de caja.",
    entityType: "cables",
    mapping: {
      code: { column: "Código Cable", transforms: ["trim", "upper", "null_if_empty"] },
      type: { column: "Tipo", transforms: ["trim", "lower"] },
      fiber_count: { column: "Nº Fibras", transforms: ["parse_number_es"] },
      length_m: { column: "Longitud (m)", transforms: ["parse_number_es"] },
      source_box_code: { column: "Origen", transforms: ["trim", "upper", "null_if_empty"] },
      target_box_code: { column: "Destino", transforms: ["trim", "upper", "null_if_empty"] },
      standard: { column: "Estándar", transforms: ["trim", "upper"] },
      installed_at: { column: "Fecha", transforms: ["parse_date_es"] },
      notes: { column: "Observaciones", transforms: ["trim", "null_if_empty"] },
    },
  },
  {
    id: "tmdigital-clients",
    name: "TMDigital · Clientes",
    description: "Clientes finales con ONT y fibra drop (CABLE:NUMERO).",
    entityType: "clients",
    mapping: {
      external_code: { column: "ID Cliente", transforms: ["trim", "upper", "null_if_empty"] },
      name: { column: "Nombre", transforms: ["trim", "collapse_spaces"] },
      document_id: { column: "DNI", transforms: ["trim", "upper", "null_if_empty"] },
      phone: { column: "Teléfono", transforms: ["trim", "null_if_empty"] },
      email: { column: "Email", transforms: ["trim", "lower", "null_if_empty"] },
      address: { column: "Dirección", transforms: ["trim", "collapse_spaces"] },
      ont_serial: { column: "ONT Serial", transforms: ["trim", "upper", "null_if_empty"] },
      ont_model: { column: "ONT Modelo", transforms: ["trim", "null_if_empty"] },
      drop_cable_code: { column: "Cable drop", transforms: ["trim", "upper", "null_if_empty"] },
      drop_fiber_number: { column: "Fibra drop", transforms: ["parse_number_es"] },
      status: { column: "Estado", transforms: ["trim", "lower"] },
      lat: { column: "Latitud", transforms: ["parse_coord"] },
      lng: { column: "Longitud", transforms: ["parse_coord"] },
      installed_at: { column: "Alta", transforms: ["parse_date_es"] },
      notes: { column: "Observaciones", transforms: ["trim", "null_if_empty"] },
    },
  },
];
