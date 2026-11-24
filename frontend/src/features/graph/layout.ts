import ELK from "elkjs/lib/elk.bundled.js";
import type { ElkNode } from "elkjs/lib/elk-api";
import type { GraphNode, NodeType } from "@/lib/types";
import type { GraphIndex } from "./model";

export const NODE_SIZE: Record<NodeType, { w: number; h: number }> = {
  TEAM: { w: 196, h: 196 },
  INITIATIVE: { w: 268, h: 100 },
  POC: { w: 268, h: 100 },
  VERSION: { w: 236, h: 78 },
  RESEARCH: { w: 224, h: 52 },
  EXPERIMENT: { w: 224, h: 52 },
  FINDING: { w: 224, h: 52 },
  PAPER: { w: 224, h: 52 },
  DOCUMENTATION: { w: 224, h: 52 },
  CODE: { w: 224, h: 52 },
  DEMO: { w: 224, h: 52 },
};

const elk = new ELK();

export type Positions = Record<string, { x: number; y: number }>;

/**
 * Layered left→right layout of the *visible* subgraph. Model order (DFS over the hierarchy) is
 * respected so sibling order never shuffles between expansions; existing nodes keep their column
 * and relative order, and only shift to make room (animated by the canvas).
 */
export async function layoutVisible(
  rootId: string,
  idx: GraphIndex,
  visible: Set<string>,
  expanded: Set<string>,
): Promise<Positions> {
  // Model order: DFS that only descends through *expanded* nodes, so a node shared between a
  // collapsed and an expanded parent is ordered after the parent that revealed it.
  const order: string[] = [];
  const seen = new Set<string>();
  const dfs = (id: string) => {
    if (seen.has(id) || !visible.has(id)) return;
    seen.add(id);
    order.push(id);
    if (id !== rootId && !expanded.has(id)) return;
    for (const c of idx.children.get(id) ?? []) dfs(c);
  };
  dfs(rootId);
  for (const id of visible) if (!seen.has(id)) order.push(id);

  const edges: { id: string; sources: string[]; targets: string[] }[] = [];
  for (const id of order) {
    for (const c of idx.children.get(id) ?? []) {
      if (visible.has(c)) edges.push({ id: `${id}->${c}`, sources: [id], targets: [c] });
    }
  }

  const graph: ElkNode = {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "RIGHT",
      "elk.layered.spacing.nodeNodeBetweenLayers": "110",
      "elk.spacing.nodeNode": "20",
      "elk.layered.spacing.edgeNodeBetweenLayers": "30",
      "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
      "elk.layered.crossingMinimization.forceNodeModelOrder": "true",
      "elk.layered.nodePlacement.strategy": "BRANDES_KOEPF",
      "elk.layered.nodePlacement.bk.fixedAlignment": "BALANCED",
      "elk.separateConnectedComponents": "false",
    },
    children: order.map((id) => {
      const n = idx.byId.get(id) as GraphNode;
      const s = NODE_SIZE[n.type];
      return { id, width: s.w, height: s.h };
    }),
    edges,
  };
  const out = await elk.layout(graph);
  const pos: Positions = {};
  for (const c of out.children ?? []) pos[c.id] = { x: c.x ?? 0, y: c.y ?? 0 };
  // Anchor the root at the origin, so positions stay comparable across layouts.
  const r = pos[rootId];
  if (r) {
    const dy = r.y;
    const dx = r.x;
    for (const k of Object.keys(pos)) pos[k] = { x: pos[k].x - dx, y: pos[k].y - dy };
  }
  return pos;
}
