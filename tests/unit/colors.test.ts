import { describe, it, expect } from "vitest";
import { colorForFiber, FIBER_COLORS } from "@/lib/geo/colors";

describe("colorForFiber (TIA-598-C)", () => {
  it("primer color es azul", () => {
    expect(colorForFiber(1)).toBe("blue");
  });

  it("colores canónicos en orden para las primeras 12 fibras", () => {
    expect(FIBER_COLORS).toEqual([
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
    ]);
    for (let n = 1; n <= 12; n++) {
      expect(colorForFiber(n)).toBe(FIBER_COLORS[n - 1]);
    }
  });

  it("cicla cada 12 fibras", () => {
    expect(colorForFiber(13)).toBe("blue");
    expect(colorForFiber(24)).toBe("aqua");
    expect(colorForFiber(25)).toBe("blue");
    expect(colorForFiber(144)).toBe("aqua");
  });

  it("rechaza índices inválidos", () => {
    expect(() => colorForFiber(0)).toThrow();
    expect(() => colorForFiber(-1)).toThrow();
    expect(() => colorForFiber(1.5)).toThrow();
  });
});
