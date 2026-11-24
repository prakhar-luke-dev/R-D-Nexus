// Pure graph derivations: hierarchy, visibility, search paths. No React.
import type { Graph, GraphEdge, GraphNode, Relationship } from "@/lib/types";
import type { GraphFilters } from "./store";

export interface GraphIndex {
  byId: Map<string, GraphNode>;
  children: Map<string, string[]>;
  parents: Map<string, string[]>;
  hierarchical: Set<Relationship>;
}

export function indexGraph(g: Graph): GraphIndex {
  const hierarchical = new Set(g.hierarchical_relationships);
  const byId = new Map(g.nodes.map((n) => [n.id, n]));
  const children = new Map<string, string[]>();
  const parents = new Map<string, string[]>();
  for (const e of g.edges) {
    if (!hierarchical.has(e.relationship)) continue;
    if (!byId.has(e.source_id) || !byId.has(e.target_id)) continue;
    (children.get(e.source_id) ?? children.set(e.source_id, []).get(e.source_id)!).push(e.target_id);
    (parents.get(e.target_id) ?? parents.set(e.target_id, []).get(e.target_id)!).push(e.source_id);
  }
  // Versions in label order; everything else keeps creation order (edges are ordered by creation).
  for (const [k, list] of children) {
    children.set(
      k,
      [...list].sort((a, b) => {
        const na = byId.get(a)!;
        const nb = byId.get(b)!;
        if (na.type === "VERSION" && nb.type === "VERSION") return na.created_at.localeCompare(nb.created_at);
        return typeOrder(na) - typeOrder(nb);
      }),
    );
  }
  return { byId, children, parents, hierarchical };
}

const ORDER = ["VERSION", "RESEARCH", "PAPER", "EXPERIMENT", "FINDING", "DOCUMENTATION", "CODE", "DEMO"];
const typeOrder = (n: GraphNode) => {
  const i = ORDER.indexOf(n.type);
  return i === -1 ? 99 : i;
};

export function passesFilters(n: GraphNode, f: GraphFilters): boolean {
  if (n.type === "TEAM") return true;
  if (f.hiddenTypes.includes(n.type)) return false;
  if (f.statuses.length && !f.statuses.includes(n.status)) return false;
  if (!f.showHistorical && n.type === "VERSION" && n.version && !n.version.is_active) return false;
  if (n.progress && (n.type === "POC" || n.type === "VERSION")) {
    const o = n.progress.overall_progress ?? 0;
    if (o < f.progressMin || o > f.progressMax) return false;
  }
  return true;
}

/** Visible = reachable from the root through expanded, filter-passing nodes. */
export function computeVisible(rootId: string, idx: GraphIndex, expanded: Set<string>, f: GraphFilters): Set<string> {
  const visible = new Set<string>([rootId]);
  const queue = [rootId];
  // The root is always expanded: initial view = team + its initiatives.
  const isOpen = (id: string) => id === rootId || expanded.has(id);
  while (queue.length) {
    const id = queue.shift()!;
    if (!isOpen(id)) continue;
    for (const c of idx.children.get(id) ?? []) {
      const n = idx.byId.get(c);
      if (!n || visible.has(c) || !passesFilters(n, f)) continue;
      visible.add(c);
      queue.push(c);
    }
  }
  return visible;
}

/** The hierarchical parent used for layout (the first visible parent). */
export function primaryParent(id: string, idx: GraphIndex, visible: Set<string>): string | undefined {
  return (idx.parents.get(id) ?? []).find((p) => visible.has(p));
}

/** Shortest path of ancestors from the root to `id` (excluding id). Used to reveal search results. */
export function pathToRoot(id: string, rootId: string, idx: GraphIndex): string[] {
  const prev = new Map<string, string>();
  const queue = [rootId];
  const seen = new Set([rootId]);
  while (queue.length) {
    const cur = queue.shift()!;
    if (cur === id) break;
    for (const c of idx.children.get(cur) ?? []) {
      if (seen.has(c)) continue;
      seen.add(c);
      prev.set(c, cur);
      queue.push(c);
    }
  }
  const path: string[] = [];
  let cur = prev.get(id);
  while (cur) {
    path.unshift(cur);
    cur = prev.get(cur);
  }
  return path;
}

export function descendants(id: string, idx: GraphIndex): string[] {
  const out: string[] = [];
  const seen = new Set<string>([id]);
  const q = [id];
  while (q.length) {
    const cur = q.shift()!;
    for (const c of idx.children.get(cur) ?? []) {
      if (seen.has(c)) continue;
      seen.add(c);
      out.push(c);
      q.push(c);
    }
  }
  return out;
}

export function visibleEdges(g: Graph, visible: Set<string>, f: GraphFilters): GraphEdge[] {
  return g.edges.filter(
    (e) =>
      visible.has(e.source_id) &&
      visible.has(e.target_id) &&
      !f.hiddenRelationships.includes(e.relationship) &&
      e.relationship !== "VERSION_OF",
  );
}
