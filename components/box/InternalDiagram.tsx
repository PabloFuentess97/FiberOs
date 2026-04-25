"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  type Node,
  type Edge,
  type Connection,
  type NodeTypes,
  type ReactFlowProps,
  useNodesState,
  useEdgesState,
  addEdge,
  MarkerType,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { FiberNode, SplitterNode, type FiberNodeData, type SplitterNodeData } from "./nodes";
import { BufferTubeNode, type BufferTubeNodeData } from "./BufferTubeNode";
import { FusionDialog } from "./FusionDialog";
import { colorForFiber } from "@/lib/geo/colors";
import { createFusionAction, deleteFusionAction } from "@/app/t/[tenantSlug]/(dashboard)/boxes/[id]/diagram/actions";
import { canFuse, type CanFuseEndpoint } from "@/lib/network/fusion";
import { Button } from "@/components/ui/button";
import { Eye, Pencil, Trash2 } from "lucide-react";
import type { InternalDiagramDTO } from "@/lib/db/queries/diagram";
import { useRouter } from "next/navigation";

interface Props {
  boxId: string;
  organizationId: string;
  diagram: InternalDiagramDTO;
  canEdit: boolean;
}

const nodeTypes: NodeTypes = {
  fiber: FiberNode,
  splitter: SplitterNode,
  tube: BufferTubeNode,
};

const FIBER_ROW_HEIGHT = 28;
const FIBER_COL_WIDTH = 220;
const SPLITTER_WIDTH = 180;
// Umbral para activar virtualización por buffer tubes (grupos de 12 fibras).
// Cables ≤ 48f se renderizan completos; >48f empiezan colapsados.
const BUFFER_THRESHOLD = 48;
const TUBE_SIZE = 12;

export function InternalDiagram({ boxId, organizationId, diagram, canEdit }: Props) {
  const router = useRouter();
  const [mode, setMode] = useState<"view" | "edit">(canEdit ? "edit" : "view");
  const [pending, startTransition] = useTransition();

  // Tubes expandidos (solo relevante para cables > BUFFER_THRESHOLD).
  const [expandedTubes, setExpandedTubes] = useState<Set<string>>(new Set());

  const toggleTube = useCallback((key: string) => {
    setExpandedTubes((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  // ============ Construir nodos y edges desde el DTO ============
  const { initialNodes, initialEdges, endpointIndex } = useMemo(
    () => buildGraph(diagram, expandedTubes, toggleTube),
    [diagram, expandedTubes, toggleTube],
  );

  const [nodes, _setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, _setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // ============ Estado modal ============
  const [dialog, setDialog] = useState<null | {
    a: CanFuseEndpoint;
    b: CanFuseEndpoint;
    warning?: string;
  }>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // ============ Conexión (drag entre handles) ============
  const onConnect = useCallback(
    (c: Connection) => {
      if (mode !== "edit") return;
      if (!c.source || !c.target) return;

      const a = endpointIndex.get(`${c.source}|${c.sourceHandle ?? ""}`);
      const b = endpointIndex.get(`${c.target}|${c.targetHandle ?? ""}`);
      if (!a || !b) return;

      const r = canFuse(a, b);
      if (!r.ok) {
        setErrorMsg(r.message ?? "Fusión inválida.");
        return;
      }
      setErrorMsg(null);
      setDialog({ a, b, warning: r.warning ? r.message : undefined });
    },
    [mode, endpointIndex],
  );

  // isValidConnection ejecuta en cada hover del drag
  const isValidConnection = useCallback<NonNullable<ReactFlowProps["isValidConnection"]>>(
    (c) => {
      if (mode !== "edit") return false;
      if (!c.source || !c.target) return false;
      const a = endpointIndex.get(`${c.source}|${c.sourceHandle ?? ""}`);
      const b = endpointIndex.get(`${c.target}|${c.targetHandle ?? ""}`);
      if (!a || !b) return false;
      return canFuse(a, b).ok;
    },
    [mode, endpointIndex],
  );

  async function confirmFusion(values: { lossDb?: number; notes?: string }) {
    if (!dialog) return;
    const res = await createFusionAction({
      boxId,
      endpointA:
        dialog.a.kind === "fiber"
          ? { kind: "fiber", id: dialog.a.fiberId }
          : { kind: "splitter_port", id: dialog.a.portId },
      endpointB:
        dialog.b.kind === "fiber"
          ? { kind: "fiber", id: dialog.b.fiberId }
          : { kind: "splitter_port", id: dialog.b.portId },
      lossDb: values.lossDb,
      notes: values.notes,
    });
    setDialog(null);
    if (!res.ok) {
      setErrorMsg(res.error);
      return;
    }
    // Evita estado desincronizado: refresca desde el servidor
    startTransition(() => router.refresh());
  }

  async function onDeleteFusion(fusionId: string) {
    if (mode !== "edit") return;
    const fd = new FormData();
    fd.set("id", fusionId);
    fd.set("boxId", boxId);
    await deleteFusionAction(fd);
    startTransition(() => router.refresh());
  }

  // Interceptar clicks en edges para borrar
  const onEdgeClick = useCallback<NonNullable<ReactFlowProps["onEdgeClick"]>>(
    (_, edge) => {
      if (mode !== "edit") return;
      const fusionId = (edge.data as { fusionId?: string } | undefined)?.fusionId;
      if (!fusionId) return;
      if (confirm("¿Eliminar esta fusión?")) onDeleteFusion(fusionId);
    },
    [mode],
  );

  // Resaltar organizationId para debug (no usado en UI pero forma parte del contrato)
  void organizationId;

  return (
    <div className="relative h-[calc(100vh-8rem)] rounded-xl border border-[var(--color-border)] bg-white">
      <div className="absolute left-3 top-3 z-10 flex items-center gap-2">
        <Button
          variant={mode === "view" ? "primary" : "outline"}
          size="sm"
          onClick={() => setMode("view")}
        >
          <Eye size={14} /> Ver
        </Button>
        {canEdit ? (
          <Button
            variant={mode === "edit" ? "primary" : "outline"}
            size="sm"
            onClick={() => setMode("edit")}
          >
            <Pencil size={14} /> Editar
          </Button>
        ) : null}
      </div>

      {errorMsg ? (
        <div className="absolute right-3 top-3 z-10 max-w-xs rounded-md bg-red-100 px-3 py-1.5 text-xs text-red-900 shadow">
          {errorMsg}
        </div>
      ) : null}

      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onEdgeClick={onEdgeClick}
        isValidConnection={isValidConnection}
        nodeTypes={nodeTypes}
        connectionMode="loose"
        fitView
        deleteKeyCode={null}
        nodesDraggable={mode === "edit"}
        nodesConnectable={mode === "edit"}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={16} />
        <Controls />
        <MiniMap pannable />
      </ReactFlow>

      {pending ? (
        <div className="absolute bottom-3 right-3 rounded-md bg-[var(--color-surface)] px-2 py-1 text-xs shadow">
          Actualizando…
        </div>
      ) : null}

      <FusionDialog
        open={dialog !== null}
        title="Nueva fusión"
        description={
          dialog
            ? `${describeEndpoint(dialog.a)} ↔ ${describeEndpoint(dialog.b)}`
            : undefined
        }
        warning={dialog?.warning}
        onConfirm={confirmFusion}
        onCancel={() => setDialog(null)}
      />
    </div>
  );
}

// ============ Construcción del grafo ============
function buildGraph(
  d: InternalDiagramDTO,
  expandedTubes: Set<string>,
  toggleTube: (key: string) => void,
) {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const endpointIndex = new Map<string, CanFuseEndpoint>();

  // Cables de entrada (izquierda)
  const inEnds = d.cableEnds.filter((c) => c.direction === "in");
  const outEnds = d.cableEnds.filter((c) => c.direction === "out");

  // Helper que renderiza las fibras de un cable-end respetando virtualización por buffer tubes.
  function emitCableFibers(
    end: (typeof inEnds)[number],
    startX: number,
    startY: number,
  ): number {
    const fiberCount = end.fibers.length;
    const useTubes = fiberCount > BUFFER_THRESHOLD;
    let y = startY;

    if (!useTubes) {
      for (const fiber of end.fibers) {
        emitFiberNode(fiber, end, startX, y, end.direction);
        y += FIBER_ROW_HEIGHT;
      }
      return y + 16;
    }

    // Dividir en tubos de 12 fibras (TIA-598-C aplica tanto al color de fibra
    // como al del tubo: tubo 1 azul, tubo 2 naranja…).
    const numTubes = Math.ceil(fiberCount / TUBE_SIZE);
    for (let t = 0; t < numTubes; t++) {
      const tubeIndex = t + 1;
      const tubeKey = `${end.cableId}:${tubeIndex}`;
      const tubeFibers = end.fibers.slice(t * TUBE_SIZE, (t + 1) * TUBE_SIZE);
      const hasFused = tubeFibers.some((f) => f.fusedTo !== null);
      // Si alguna fibra del tubo participa en una fusión existente, lo forzamos abierto:
      // de lo contrario los edges apuntarían a nodos que no se renderizan.
      const expanded = expandedTubes.has(tubeKey) || hasFused;
      const fusedCount = tubeFibers.filter((f) => f.status === "fused").length;

      const tubeNodeId = `tube:${tubeKey}`;
      nodes.push({
        id: tubeNodeId,
        type: "tube",
        position: { x: startX, y },
        data: {
          tubeIndex,
          tubeColor: colorForFiber(tubeIndex),
          cableCode: end.cableCode,
          direction: end.direction,
          expanded,
          onToggle: () => toggleTube(tubeKey),
          fiberCount: tubeFibers.length,
          fusedCount,
        } satisfies BufferTubeNodeData as unknown as Record<string, unknown>,
        draggable: true,
      });
      y += FIBER_ROW_HEIGHT;

      if (expanded) {
        for (const fiber of tubeFibers) {
          emitFiberNode(fiber, end, startX + 16, y, end.direction);
          y += FIBER_ROW_HEIGHT;
        }
        y += 6;
      }
    }
    return y + 16;
  }

  function emitFiberNode(
    fiber: (typeof inEnds)[number]["fibers"][number],
    end: (typeof inEnds)[number],
    x: number,
    y: number,
    direction: "in" | "out",
  ) {
    const nodeId = `fiber:${fiber.id}`;
    const data: FiberNodeData = {
      fiberId: fiber.id,
      number: fiber.number,
      color: fiber.color,
      cableCode: end.cableCode,
      direction,
      alreadyFused: fiber.status === "fused",
    };
    nodes.push({
      id: nodeId,
      type: "fiber",
      position: { x, y },
      data: data as unknown as Record<string, unknown>,
      draggable: true,
    });
    endpointIndex.set(`${nodeId}|f`, {
      kind: "fiber",
      fiberId: fiber.id,
      organizationId: "",
      boxId: d.boxId,
      cableId: end.cableId,
      alreadyFused: fiber.status === "fused",
    });
  }

  let y = 0;
  for (const end of inEnds) {
    y = emitCableFibers(end, 0, y);
  }

  // Splitters en el centro (columna x=FIBER_COL_WIDTH*2)
  let sy = 0;
  const splitterX = FIBER_COL_WIDTH + 40;
  for (const s of d.splitters) {
    const inputPort = s.ports.find((p) => p.kind === "input");
    const outputPorts = s.ports.filter((p) => p.kind === "output").sort((a, b) => a.portNumber - b.portNumber);
    if (!inputPort) continue;

    const portFused: Record<string, boolean> = {};
    for (const p of s.ports) portFused[p.id] = p.fusedTo !== null;

    const nodeId = `splitter:${s.id}`;
    const data: SplitterNodeData = {
      splitterId: s.id,
      code: s.code,
      ratio: s.ratio,
      portIds: {
        inputId: inputPort.id,
        outputIds: outputPorts.map((p) => p.id),
      },
      portFused,
    };
    nodes.push({
      id: nodeId,
      type: "splitter",
      position: { x: splitterX, y: sy },
      data: data as unknown as Record<string, unknown>,
      draggable: true,
    });

    // Index handles
    endpointIndex.set(`${nodeId}|in`, {
      kind: "splitter_port",
      portId: inputPort.id,
      organizationId: "",
      boxId: d.boxId,
      splitterId: s.id,
      portKind: "input",
      alreadyFused: portFused[inputPort.id] ?? false,
    });
    outputPorts.forEach((p, i) => {
      endpointIndex.set(`${nodeId}|out-${i + 1}`, {
        kind: "splitter_port",
        portId: p.id,
        organizationId: "",
        boxId: d.boxId,
        splitterId: s.id,
        portKind: "output",
        alreadyFused: portFused[p.id] ?? false,
      });
    });

    sy += 80 + outputPorts.length * 22;
  }

  // Cables de salida (derecha)
  let oy = 0;
  const outX = splitterX + SPLITTER_WIDTH + 80;
  for (const end of outEnds) {
    oy = emitCableFibers(end, outX, oy);
  }

  // Fusiones existentes → edges
  for (const f of d.fusions) {
    const aHandle = handleFor(f.endpointA);
    const bHandle = handleFor(f.endpointB);
    if (!aHandle || !bHandle) continue;
    edges.push({
      id: `fusion:${f.id}`,
      source: aHandle.nodeId,
      sourceHandle: aHandle.handle,
      target: bHandle.nodeId,
      targetHandle: bHandle.handle,
      data: { fusionId: f.id },
      animated: false,
      style: { stroke: "#1E5FFF", strokeWidth: 2 },
      markerEnd: { type: MarkerType.ArrowClosed, color: "#1E5FFF" },
    });
  }

  // Helper para edges en builder scope
  function handleFor(ep: { kind: "fiber" | "splitter_port"; id: string }) {
    if (ep.kind === "fiber") {
      return { nodeId: `fiber:${ep.id}`, handle: "f" };
    }
    // splitter_port: encontrar el splitter y el handle
    for (const s of d.splitters) {
      if (s.ports.find((p) => p.id === ep.id && p.kind === "input")) {
        return { nodeId: `splitter:${s.id}`, handle: "in" };
      }
      const op = s.ports.find((p) => p.id === ep.id && p.kind === "output");
      if (op) return { nodeId: `splitter:${s.id}`, handle: `out-${op.portNumber}` };
    }
    return null;
  }

  return { initialNodes: nodes, initialEdges: edges, endpointIndex };
}

// suppress unused imports warnings
void addEdge;

function describeEndpoint(e: CanFuseEndpoint): string {
  if (e.kind === "fiber") return `Fibra ${e.fiberId.slice(0, 6)}`;
  return `Splitter ${e.splitterId.slice(0, 6)} · ${e.portKind}`;
}
