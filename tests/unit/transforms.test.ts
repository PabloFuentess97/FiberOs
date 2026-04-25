import { describe, it, expect } from "vitest";
import { applyTransforms, TRANSFORMS } from "@/lib/importer/transforms";

describe("transforms", () => {
  it("trim + upper encadenados", () => {
    expect(applyTransforms("  hola  ", ["trim", "upper"])).toBe("HOLA");
  });

  it("null_if_empty cortocircuita", () => {
    expect(applyTransforms("   ", ["trim", "null_if_empty", "upper"])).toBeNull();
  });

  it("parse_number_es con coma decimal", () => {
    expect(TRANSFORMS.parse_number_es("1.234,56")).toBe(1234.56);
    expect(TRANSFORMS.parse_number_es("42")).toBe(42);
    expect(TRANSFORMS.parse_number_es("")).toBeNull();
    expect(TRANSFORMS.parse_number_es("abc")).toBeNull();
  });

  it("parse_coord decimal y DMS", () => {
    expect(TRANSFORMS.parse_coord("37,1773")).toBeCloseTo(37.1773, 4);
    expect(TRANSFORMS.parse_coord("-3,5986")).toBeCloseTo(-3.5986, 4);
    const dms = TRANSFORMS.parse_coord("37° 10' 38.2\" N");
    expect(dms as number).toBeCloseTo(37.1772778, 4);
    expect(TRANSFORMS.parse_coord("nonsense")).toBeNull();
  });

  it("parse_date_es acepta varios separadores", () => {
    expect(TRANSFORMS.parse_date_es("15/03/2025")).toBe("2025-03-15");
    expect(TRANSFORMS.parse_date_es("1-1-2024")).toBe("2024-01-01");
    expect(TRANSFORMS.parse_date_es("2025-12-31")).toBe("2025-12-31");
    expect(TRANSFORMS.parse_date_es("15/13/2025")).toBeNull(); // mes inválido
    expect(TRANSFORMS.parse_date_es("")).toBeNull();
  });

  it("collapse_spaces", () => {
    expect(TRANSFORMS.collapse_spaces("  foo   bar  ")).toBe("foo bar");
  });
});
