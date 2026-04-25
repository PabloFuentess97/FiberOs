import type { FusionEndpointKind } from "@/lib/db/schema/fusion";

/**
 * Endpoint normalizado para `canFuse`. Las tablas de dominio (fibers, splitter_ports)
 * se pre-cargan con su organization_id + box_id + cable_id + splitter_id asociado.
 */
export interface FiberEndpoint {
  kind: "fiber";
  fiberId: string;
  organizationId: string;
  boxId: string | null; // caja donde está físicamente la fibra
  cableId: string;
  alreadyFused: boolean;
}

export interface SplitterPortEndpoint {
  kind: "splitter_port";
  portId: string;
  organizationId: string;
  boxId: string; // splitter siempre vive en una caja
  splitterId: string;
  portKind: "input" | "output";
  alreadyFused: boolean;
}

export type CanFuseEndpoint = FiberEndpoint | SplitterPortEndpoint;

export interface CanFuseResult {
  ok: boolean;
  code?:
    | "different_org"
    | "different_box"
    | "already_fused"
    | "self_same_endpoint"
    | "same_cable_warning"
    | "two_inputs"
    | "missing_box";
  message?: string;
  warning?: boolean;
}

/**
 * Valida si dos extremos pueden fusionarse. Idéntica lógica en cliente (bloquea drag)
 * y servidor (bloquea insert). Solo chequea invariantes lógicas; la unicidad por
 * extremo la garantiza `fusion_endpoints` con UNIQUE parcial.
 */
export function canFuse(a: CanFuseEndpoint, b: CanFuseEndpoint): CanFuseResult {
  if (a.organizationId !== b.organizationId) {
    return { ok: false, code: "different_org", message: "Los extremos pertenecen a organizaciones distintas." };
  }

  if (a.alreadyFused || b.alreadyFused) {
    return { ok: false, code: "already_fused", message: "Uno de los extremos ya está fusionado." };
  }

  // Self-reference
  if (a.kind === "fiber" && b.kind === "fiber" && a.fiberId === b.fiberId) {
    return { ok: false, code: "self_same_endpoint", message: "No se puede fusionar una fibra consigo misma." };
  }
  if (
    a.kind === "splitter_port" &&
    b.kind === "splitter_port" &&
    a.portId === b.portId
  ) {
    return { ok: false, code: "self_same_endpoint", message: "No se puede fusionar un puerto consigo mismo." };
  }

  // Misma caja
  if (a.boxId !== b.boxId) {
    if (a.boxId === null || b.boxId === null) {
      return {
        ok: false,
        code: "missing_box",
        message: "Uno de los extremos no tiene una caja asociada.",
      };
    }
    return {
      ok: false,
      code: "different_box",
      message: "Ambos extremos deben estar en la misma caja.",
    };
  }

  // No fusionar dos inputs de splitter (físicamente sin sentido)
  if (
    a.kind === "splitter_port" &&
    b.kind === "splitter_port" &&
    a.portKind === "input" &&
    b.portKind === "input"
  ) {
    return {
      ok: false,
      code: "two_inputs",
      message: "No se pueden fusionar dos inputs de splitter entre sí.",
    };
  }

  // Warning (no bloqueo): dos fibras del mismo cable
  if (a.kind === "fiber" && b.kind === "fiber" && a.cableId === b.cableId) {
    return {
      ok: true,
      warning: true,
      code: "same_cable_warning",
      message: "Ambas fibras pertenecen al mismo cable. Confirma que es intencional (loop-back).",
    };
  }

  return { ok: true };
}

export const FUSION_ENDPOINT_KINDS: FusionEndpointKind[] = ["fiber", "splitter_port"];

export function splitterOutputCount(ratio: string): number {
  const m = /^1x(\d+)$/.exec(ratio);
  if (!m?.[1]) return 0;
  return Number(m[1]);
}
