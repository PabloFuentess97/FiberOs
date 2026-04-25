"use client";

import type { NodeProps } from "@xyflow/react";
import { Handle, Position } from "@xyflow/react";
import { FIBER_HEX } from "@/lib/geo/colors";
import type { FiberColor } from "@/lib/db/schema/network";
import { splitterOutputCount } from "@/lib/network/fusion";

export interface FiberNodeData extends Record<string, unknown> {
  fiberId: string;
  number: number;
  color: FiberColor;
  cableCode: string;
  direction: "in" | "out";
  alreadyFused: boolean;
}

export interface SplitterNodeData extends Record<string, unknown> {
  splitterId: string;
  code: string;
  ratio: string;
  portIds: { inputId: string; outputIds: string[] };
  portFused: Record<string, boolean>;
}

export function FiberNode({ data }: NodeProps) {
  const d = data as FiberNodeData;
  const side = d.direction === "in" ? Position.Right : Position.Left;
  return (
    <div
      className={`flex items-center gap-2 rounded-md border bg-white px-2 py-1 text-xs shadow-sm ${
        d.alreadyFused ? "border-[var(--color-muted)] opacity-70" : "border-[var(--color-border)]"
      }`}
    >
      <span
        className="inline-block h-3 w-3 rounded-full border border-[var(--color-border)]"
        style={{ background: FIBER_HEX[d.color] }}
        aria-hidden
      />
      <span className="font-mono">
        {d.cableCode}:{String(d.number).padStart(2, "0")}
      </span>
      <Handle
        type="source"
        position={side}
        id="f"
        style={{ background: FIBER_HEX[d.color], width: 8, height: 8 }}
      />
    </div>
  );
}

export function SplitterNode({ data }: NodeProps) {
  const d = data as SplitterNodeData;
  const outputs = splitterOutputCount(d.ratio);
  return (
    <div className="rounded-lg border border-[var(--brand-primary)]/60 bg-white p-2 shadow-sm">
      <div className="mb-2 text-center text-xs font-medium">
        {d.code} <span className="text-[var(--color-muted)]">· {d.ratio}</span>
      </div>
      {/* Input handle (izquierda) */}
      <div className="relative mb-2">
        <div className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-[10px]">
          IN
        </div>
        <Handle
          type="target"
          position={Position.Left}
          id={`in`}
          style={{
            background: d.portFused[d.portIds.inputId] ? "#64748B" : "#1E5FFF",
            width: 10,
            height: 10,
          }}
        />
      </div>
      {/* Outputs handles (derecha) */}
      <div className="grid gap-1">
        {Array.from({ length: outputs }, (_, i) => {
          const portId = d.portIds.outputIds[i];
          const fused = portId ? d.portFused[portId] : false;
          return (
            <div
              key={i}
              className="relative rounded border border-[var(--color-border)] bg-white px-2 py-0.5 text-[10px]"
            >
              OUT {i + 1}
              <Handle
                type="source"
                position={Position.Right}
                id={`out-${i + 1}`}
                style={{
                  background: fused ? "#64748B" : "#16A34A",
                  width: 10,
                  height: 10,
                }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
