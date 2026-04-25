import { describe, it, expect } from "vitest";
import { canFuse, splitterOutputCount, type CanFuseEndpoint } from "@/lib/network/fusion";

const BOX_A = "box-aaaaaaaa";
const BOX_B = "box-bbbbbbbb";
const ORG = "org-1111";
const ORG_OTHER = "org-2222";

function fiber(id: string, opts: Partial<CanFuseEndpoint & { kind: "fiber" }> = {}): CanFuseEndpoint {
  return {
    kind: "fiber",
    fiberId: id,
    organizationId: opts.organizationId ?? ORG,
    boxId: opts.boxId ?? BOX_A,
    cableId: (opts as { cableId?: string }).cableId ?? "cable-1",
    alreadyFused: opts.alreadyFused ?? false,
  };
}

function port(
  id: string,
  portKind: "input" | "output" = "output",
  opts: Partial<CanFuseEndpoint & { kind: "splitter_port" }> = {},
): CanFuseEndpoint {
  return {
    kind: "splitter_port",
    portId: id,
    organizationId: opts.organizationId ?? ORG,
    boxId: opts.boxId ?? BOX_A,
    splitterId: (opts as { splitterId?: string }).splitterId ?? "spl-1",
    portKind,
    alreadyFused: opts.alreadyFused ?? false,
  };
}

describe("canFuse", () => {
  it("acepta dos fibras de cables distintos en la misma caja", () => {
    const r = canFuse(fiber("f1", { cableId: "c1" }), fiber("f2", { cableId: "c2" }));
    expect(r.ok).toBe(true);
    expect(r.warning).toBeFalsy();
  });

  it("rechaza organizaciones distintas", () => {
    const r = canFuse(fiber("f1"), fiber("f2", { organizationId: ORG_OTHER }));
    expect(r.ok).toBe(false);
    expect(r.code).toBe("different_org");
  });

  it("rechaza fibras en cajas distintas", () => {
    const r = canFuse(fiber("f1", { boxId: BOX_A }), fiber("f2", { boxId: BOX_B }));
    expect(r.ok).toBe(false);
    expect(r.code).toBe("different_box");
  });

  it("rechaza cuando algún extremo ya está fusionado", () => {
    const r = canFuse(fiber("f1", { alreadyFused: true }), fiber("f2"));
    expect(r.ok).toBe(false);
    expect(r.code).toBe("already_fused");
  });

  it("rechaza autofusión de fibra", () => {
    const r = canFuse(fiber("same"), fiber("same"));
    expect(r.ok).toBe(false);
    expect(r.code).toBe("self_same_endpoint");
  });

  it("rechaza autofusión de puerto", () => {
    const r = canFuse(port("p1", "output"), port("p1", "output"));
    expect(r.ok).toBe(false);
    expect(r.code).toBe("self_same_endpoint");
  });

  it("rechaza fusionar dos inputs de splitter", () => {
    const r = canFuse(
      port("p1", "input", { splitterId: "spl-1" }),
      port("p2", "input", { splitterId: "spl-2" }),
    );
    expect(r.ok).toBe(false);
    expect(r.code).toBe("two_inputs");
  });

  it("permite fusionar input con output", () => {
    const r = canFuse(port("in", "input"), port("out", "output"));
    expect(r.ok).toBe(true);
  });

  it("permite fusionar fibra con output de splitter", () => {
    const r = canFuse(fiber("f1"), port("out", "output"));
    expect(r.ok).toBe(true);
  });

  it("warning (no bloqueo) si dos fibras pertenecen al mismo cable", () => {
    const r = canFuse(fiber("f1", { cableId: "c1" }), fiber("f2", { cableId: "c1" }));
    expect(r.ok).toBe(true);
    expect(r.warning).toBe(true);
    expect(r.code).toBe("same_cable_warning");
  });

  it("rechaza si boxId es null en alguno (fibra sin caja asociada)", () => {
    const a = fiber("f1") as CanFuseEndpoint;
    const b = { ...fiber("f2"), boxId: null } as CanFuseEndpoint;
    const r = canFuse(a, b);
    expect(r.ok).toBe(false);
    expect(r.code).toBe("missing_box");
  });
});

describe("splitterOutputCount", () => {
  it("parsea ratios conocidos", () => {
    expect(splitterOutputCount("1x2")).toBe(2);
    expect(splitterOutputCount("1x8")).toBe(8);
    expect(splitterOutputCount("1x32")).toBe(32);
    expect(splitterOutputCount("1x64")).toBe(64);
  });
  it("devuelve 0 en formatos no válidos", () => {
    expect(splitterOutputCount("abc")).toBe(0);
    expect(splitterOutputCount("")).toBe(0);
    expect(splitterOutputCount("2x4")).toBe(0);
  });
});
