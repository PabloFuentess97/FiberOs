import type { BoxType } from "@/lib/db/schema/network";

export const BOX_TYPE_META: Record<
  BoxType,
  { color: string; icon: string; label: string; sort: number }
> = {
  olt_headend: { color: "#DC2626", icon: "server", label: "Cabecera OLT", sort: 0 },
  main_trunk: { color: "#7C3AED", icon: "network", label: "Troncal principal", sort: 1 },
  trunk: { color: "#1E5FFF", icon: "network", label: "Troncal", sort: 2 },
  subtrunk: { color: "#0EA5E9", icon: "git-branch", label: "Subtroncal", sort: 3 },
  cto: { color: "#16A34A", icon: "box", label: "CTO", sort: 4 },
  manhole: { color: "#64748B", icon: "circle-dot", label: "Arqueta", sort: 5 },
  splice_closure: { color: "#F59E0B", icon: "package", label: "Caja de empalme", sort: 6 },
  pole: { color: "#854D0E", icon: "flag", label: "Poste", sort: 7 },
};

export const CABLE_WIDTH: Record<string, number> = {
  main_trunk: 4,
  trunk: 3,
  subtrunk: 2,
  drop: 1,
};
