import { describe, it, expect } from "vitest";
import { pointSQL, lineStringSQL } from "@/lib/geo/postgis";

describe("pointSQL", () => {
  it("genera SRID 4326 con POINT(lng lat)", () => {
    const sqlObj = pointSQL({ lat: 37.17727, lng: -3.59881 });
    const asString = JSON.stringify(sqlObj);
    expect(asString).toContain("SRID=4326");
    expect(asString).toContain("POINT(-3.59881 37.17727)");
  });

  it("rechaza lat fuera de rango", () => {
    expect(() => pointSQL({ lat: 95, lng: 0 })).toThrow();
    expect(() => pointSQL({ lat: 0, lng: 181 })).toThrow();
  });

  it("rechaza NaN", () => {
    expect(() => pointSQL({ lat: Number.NaN, lng: 0 })).toThrow();
  });
});

describe("lineStringSQL", () => {
  it("requiere al menos 2 puntos", () => {
    expect(() => lineStringSQL([{ lat: 1, lng: 2 }])).toThrow();
  });

  it("serializa coordenadas en orden lng lat", () => {
    const s = JSON.stringify(
      lineStringSQL([
        { lat: 10, lng: 20 },
        { lat: 30, lng: 40 },
      ]),
    );
    expect(s).toContain("LINESTRING(20 10, 40 30)");
  });
});
