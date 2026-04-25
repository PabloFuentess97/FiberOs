import { describe, it, expect } from "vitest";
import { levenshtein, proposeMapping } from "@/lib/importer/mapping";

describe("levenshtein", () => {
  it("distancia 0 para strings iguales", () => {
    expect(levenshtein("code", "code")).toBe(0);
  });
  it("ignora diferencias mínimas", () => {
    expect(levenshtein("code", "cod")).toBe(1);
    expect(levenshtein("cables", "cabels")).toBe(2);
  });
});

describe("proposeMapping", () => {
  it("propone mapeo sensible para headers TMDigital", () => {
    const m = proposeMapping(
      ["Código", "Tipo", "Dirección", "Latitud", "Longitud"],
      "boxes",
    );
    expect(m.code?.column).toBe("Código");
    expect(m.type?.column).toBe("Tipo");
    expect(m.lat?.column).toBe("Latitud");
    expect(m.lng?.column).toBe("Longitud");
    expect(m.address?.column).toBe("Dirección");
  });

  it("adjunta transforms por defecto", () => {
    const m = proposeMapping(["Código", "Latitud", "Longitud"], "boxes");
    expect(m.code?.transforms).toContain("upper");
    expect(m.lat?.transforms).toContain("parse_coord");
  });

  it("headers sin match no aparecen en mapping", () => {
    const m = proposeMapping(["foobarbaz"], "boxes");
    expect(m.code).toBeUndefined();
  });
});
