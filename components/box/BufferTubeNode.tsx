"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { FiberColor } from "@/lib/db/schema/network";
import { FIBER_HEX } from "@/lib/geo/colors";

export interface BufferTubeNodeData extends Record<string, unknown> {
  tubeIndex: number; // 1-based
  tubeColor: FiberColor;
  cableCode: string;
  direction: "in" | "out";
  expanded: boolean;
  onToggle: () => void;
  fiberCount: number; // fibras en este tubo (hasta 12)
  fusedCount: number;
}

/**
 * Representa un buffer tube (grupo de hasta 12 fibras) como un nodo colapsado.
 * Al expandir, los FiberNode hijos se muestran individualmente.
 * Los tubos siguen TIA-598-C en paralelo a los colores de fibra.
 */
export function BufferTubeNode({ data }: NodeProps) {
  const d = data as BufferTubeNodeData;
  const side = d.direction === "in" ? Position.Right : Position.Left;
  return (
    <button
      type="button"
      onClick={d.onToggle}
      className="flex items-center gap-2 rounded-md border border-[var(--color-border)] bg-white px-2 py-1 text-xs shadow-sm hover:bg-[var(--color-surface)]"
    >
      {d.expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
      <span
        className="inline-block h-3 w-3 rounded-full border border-[var(--color-border)]"
        style={{ background: FIBER_HEX[d.tubeColor] }}
        aria-hidden
      />
      <span className="font-mono">
        {d.cableCode} · Tubo {d.tubeIndex}
      </span>
      <span className="text-[10px] text-[var(--color-muted)]">
        {d.fusedCount}/{d.fiberCount}
      </span>
      {/* Handle "mudo" para edges agregados cuando el tubo está colapsado (Sprint 5+). */}
      <Handle type="source" position={side} id="tube" style={{ opacity: 0, pointerEvents: "none" }} />
    </button>
  );
}
