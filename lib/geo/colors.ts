import type { FiberColor } from "@/lib/db/schema/network";

// Estándar TIA-598-C: orden canónico de 12 colores para identificar fibras.
// Se usa también para buffers y tubos cuando cables superan 12 fibras.
export const FIBER_COLORS: readonly FiberColor[] = [
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
] as const;

/**
 * Devuelve el color canónico (TIA-598-C) para la fibra `n` (1-based).
 * Cables con más de 12 fibras repiten el ciclo; la identificación real
 * dentro de un cable grande combina color de fibra + color de tubo.
 */
export function colorForFiber(n: number): FiberColor {
  if (!Number.isInteger(n) || n < 1) {
    throw new Error(`Número de fibra inválido: ${n}`);
  }
  // Non-null porque (n-1) % 12 ∈ [0, 11] y el array tiene 12.
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  return FIBER_COLORS[(n - 1) % 12]!;
}

/** Hex para representar cada color de fibra en UI (mapa + diagrama). */
export const FIBER_HEX: Record<FiberColor, string> = {
  blue: "#1E5FFF",
  orange: "#F97316",
  green: "#16A34A",
  brown: "#854D0E",
  slate: "#64748B",
  white: "#F8FAFC",
  red: "#DC2626",
  black: "#0F172A",
  yellow: "#EAB308",
  violet: "#7C3AED",
  rose: "#E11D48",
  aqua: "#22D3EE",
};
