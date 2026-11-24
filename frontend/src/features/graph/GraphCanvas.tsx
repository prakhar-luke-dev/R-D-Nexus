"use client";

import {
  Background,
  BackgroundVariant,
  type Connection,
  type Edge as RFEdge,
  MarkerType,
  MiniMap,
  type NodeMouseHandler,
  type OnNodeDrag,
  ReactFlow,
  useNodesState,
  useReactFlow,
} from "@xyflow/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/components/ui/primitives";
import { api } from "@/lib/api";
import { NODE_TYPES, RELATIONSHIPS } from "@/lib/meta";
import type { Graph, GraphEdge, NodeType } from "@/lib/types";
import { RelationshipDialog } from "../dialogs/RelationshipDialog";
import { DeleteEdgeDialog } from "../dialogs/DeleteEdgeDialog";
import { layoutVisible, NODE_SIZE, type Positions } from "./layout";
import { computeVisible, indexGraph, visibleEdges } from "./model";
import { ExperimentNode, FindingNode, ResearchNode, ResourceNode } from "./nodes/CompactNodes";
import { POCNode } from "./nodes/POCNode";
import type { FlowNode } from "./nodes/shared";
import { TeamNode } from "./nodes/TeamNode";
import { VersionNode } from "./nodes/VersionNode";
import { useGraphUI } from "./store";

const PANEL_WIDTH = 480;
// xyflow v13 reads a bare number as pixels; leave room for the toolbar/HUD (top) and controls.
const FIT_PADDING = { top: "150px", bottom: "48px", left: "48px", right: "48px" } as const;

const nodeTypes = {
  team: TeamNode,
  poc: POCNode,
  version: VersionNode,
  research: ResearchNode,
  experiment: ExperimentNode,
  finding: FindingNode,
  resource: ResourceNode,
};

const RF_TYPE: Record<NodeType, keyof typeof nodeTypes> = {
  TEAM: "team",
  INITIATIVE: "poc",
  POC: "poc",
  VERSION: "version",
  RESEARCH: "research",
  EXPERIMENT: "experiment",
  FINDING: "finding",
  PAPER: "resource",
  DOCUMENTATION: "resource",
  CODE: "resource",
  DEMO: "resource",
};

export function GraphCanvas({ graph }: { graph: Graph }) {
  const rf = useReactFlow<FlowNode>();
  const {
    expanded,
    selectedId,
    filters,
    connectMode,
    fitRequest,
    focusId,
    toggle,
    select,
    expand,
    setFocus,
    closePanel,
  } = useGraphUI();

  const idx = useMemo(() => indexGraph(graph), [graph]);
  const expandedSet = useMemo(() => new Set(expanded), [expanded]);
  const visible = useMemo(
    () => computeVisible(graph.root_id, idx, expandedSet, filters),
    [graph.root_id, idx, expandedSet, filters],
  );
  const visibleKey = useMemo(() => [...visible].sort().join("|") + `#${graph.edges.length}`, [visible, graph.edges.length]);

  // --- Layout --------------------------------------------------------------------------------
  const [layoutState, setLayoutState] = useState<{ pos: Positions; newIds: Set<string> } | null>(null);
  const layout = layoutState?.pos ?? null;
  const [animating, setAnimating] = useState(false);
  // Manually dragged positions (persisted to the API) override the automatic layout.
  const [pinned, setPinned] = useState<Positions>({});
  const prevVisible = useRef<Set<string>>(new Set());
  const firstLayout = useRef(true);

  const positionOf = useCallback(
    (id: string, pos: Positions) => pinned[id] ?? idx.byId.get(id)?.position ?? pos[id] ?? { x: 0, y: 0 },
    [idx, pinned],
  );

  const ensureVisible = useCallback(
    (ids: string[], pos: Positions) => {
      const el = document.querySelector(".react-flow") as HTMLElement | null;
      if (!el) return;
      const { x: tx, y: ty, zoom } = rf.getViewport();
      const W = el.clientWidth - (useGraphUI.getState().panelOpen ? PANEL_WIDTH : 0);
      const H = el.clientHeight;
      const outside = ids.some((id) => {
        const p = positionOf(id, pos);
        const s = NODE_SIZE[idx.byId.get(id)?.type ?? "RESEARCH"];
        const sx = p.x * zoom + tx;
        const sy = p.y * zoom + ty;
        return sx < 0 || sy < 0 || sx + s.w * zoom > W - 40 || sy + s.h * zoom > H - 40;
      });
      if (outside) {
        const parents = new Set(ids.flatMap((id) => idx.parents.get(id) ?? []).filter((p) => visible.has(p)));
        rf.fitView({ nodes: [...ids, ...parents].map((id) => ({ id })), padding: FIT_PADDING, maxZoom: 1, duration: 500 });
      }
    },
    [rf, idx, positionOf, visible],
  );

  useEffect(() => {
    let cancelled = false;
    layoutVisible(graph.root_id, idx, visible, expandedSet).then((pos) => {
      if (cancelled) return;
      const newIds = new Set([...visible].filter((id) => !prevVisible.current.has(id)));
      const appeared = !firstLayout.current ? [...newIds] : [];
      prevVisible.current = new Set(visible);
      setAnimating(true);
      setLayoutState({ pos, newIds });
      window.setTimeout(() => setAnimating(false), 520);
      if (firstLayout.current) {
        firstLayout.current = false;
        requestAnimationFrame(() => rf.fitView({ padding: FIT_PADDING, maxZoom: 1, duration: 0 }));
      } else if (appeared.length) {
        // Keep the newly revealed branch on screen without resetting the user's view.
        window.setTimeout(() => ensureVisible(appeared, pos), 60);
      }
    });
    return () => {
      cancelled = true;
    };
    // Re-layout only when the visible structure changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleKey]);

  // "Reset layout" drops manual (dragged) positions.
  useEffect(
    () =>
      useGraphUI.subscribe((s, prev) => {
        if (s.layoutReset === prev.layoutReset) return;
        setPinned({});
        setAnimating(true);
        window.setTimeout(() => setAnimating(false), 520);
      }),
    [],
  );

  // --- Highlight -------------------------------------------------------------------------------
  const neighbourIds = useMemo(() => {
    if (!selectedId) return null;
    const s = new Set<string>([selectedId]);
    for (const e of graph.edges) {
      if (e.source_id === selectedId) s.add(e.target_id);
      if (e.target_id === selectedId) s.add(e.source_id);
    }
    return s;
  }, [selectedId, graph.edges]);

  // --- React Flow nodes ----------------------------------------------------------------------
  const derivedNodes: FlowNode[] = useMemo(() => {
    if (!layout) return [];
    const out: FlowNode[] = [];
    for (const id of visible) {
      const n = idx.byId.get(id);
      if (!n) continue;
      const size = NODE_SIZE[n.type];
      const childCount = (idx.children.get(id) ?? []).length;
      const highlighted = !neighbourIds || neighbourIds.has(id);
      out.push({
        id,
        type: RF_TYPE[n.type],
        position: positionOf(id, layout),
        width: size.w,
        height: size.h,
        selected: id === selectedId,
        className: cn(!highlighted && "dimmed"),
        data: {
          node: n,
          childCount: id === graph.root_id ? 0 : childCount,
          expanded: expandedSet.has(id),
          isNew: layoutState?.newIds.has(id) ?? false,
          highlighted,
          onToggle: toggle,
        },
      });
    }
    return out;
  }, [layout, layoutState, visible, idx, neighbourIds, selectedId, expandedSet, toggle, graph.root_id, positionOf]);

  // React Flow owns transient state (dragging); reset it whenever the derived nodes change.
  const [nodes, setNodes, onNodesChange] = useNodesState<FlowNode>(derivedNodes);
  const [prevDerived, setPrevDerived] = useState(derivedNodes);
  if (derivedNodes !== prevDerived) {
    setPrevDerived(derivedNodes);
    setNodes(derivedNodes);
  }

  // --- Edges ---------------------------------------------------------------------------------
  const edges: RFEdge[] = useMemo(() => {
    return visibleEdges(graph, visible, filters).map((e: GraphEdge) => {
      const meta = RELATIONSHIPS[e.relationship];
      const hierarchical = idx.hierarchical.has(e.relationship);
      const active = !!neighbourIds && (e.source_id === selectedId || e.target_id === selectedId);
      const dim = !!neighbourIds && !active;
      return {
        id: e.id,
        source: e.source_id,
        target: e.target_id,
        type: "default",
        animated: false,
        className: cn(dim && "dimmed"),
        label: active && !hierarchical ? meta.label : undefined,
        labelStyle: { fill: "var(--text-muted)", fontSize: 10 },
        labelBgStyle: { fill: "var(--bg-elev)" },
        labelBgPadding: [4, 2] as [number, number],
        style: {
          stroke: active ? "#aab4ff" : meta.color,
          strokeWidth: active ? 1.8 : hierarchical ? 1.4 : 1.1,
          strokeDasharray: meta.dashed ? "5 5" : undefined,
          animation: active && meta.dashed ? "dash 1.2s linear infinite" : undefined,
        },
        markerEnd: hierarchical ? undefined : { type: MarkerType.ArrowClosed, width: 14, height: 14, color: active ? "#aab4ff" : meta.color },
        data: { relationship: e.relationship },
      };
    });
  }, [graph, visible, filters, idx, neighbourIds, selectedId]);

  // --- Interaction ---------------------------------------------------------------------------
  const onNodeClick: NodeMouseHandler<FlowNode> = useCallback(
    (_, node) => {
      const id = node.id;
      const hasChildren = (idx.children.get(id) ?? []).length > 0 && id !== graph.root_id;
      if (hasChildren && !expandedSet.has(id)) {
        expand([id]); // first click on a collapsed node: expand
        select(id, false); // highlight it without opening the panel
      } else {
        select(id, true); // expanded node or leaf: inspect
      }
    },
    [idx, expandedSet, expand, select, graph.root_id],
  );

  const onNodeDragStop: OnNodeDrag<FlowNode> = useCallback((_, node) => {
    setPinned((p) => ({ ...p, [node.id]: { x: node.position.x, y: node.position.y } }));
    // Manual positions persist; failures are non-critical (layout falls back to automatic).
    api.patchNode(node.id, { position: { x: node.position.x, y: node.position.y } }).catch(() => undefined);
  }, []);

  const [pendingConnection, setPendingConnection] = useState<Connection | null>(null);
  const [edgeToDelete, setEdgeToDelete] = useState<GraphEdge | null>(null);

  // Fit requests from the toolbar / reset
  useEffect(() => {
    if (!fitRequest.seq) return;
    const t = window.setTimeout(
      () =>
        rf.fitView({
          nodes: fitRequest.ids?.map((id) => ({ id })),
          padding: FIT_PADDING,
          maxZoom: 1,
          duration: 500,
        }),
      fitRequest.ids ? 80 : 0,
    );
    return () => window.clearTimeout(t);
  }, [fitRequest, rf]);

  // Focus a search result once it is laid out
  useEffect(() => {
    if (!focusId || !layout || !layout[focusId]) return;
    const p = positionOf(focusId, layout);
    const s = NODE_SIZE[idx.byId.get(focusId)?.type ?? "RESEARCH"];
    const zoom = Math.max(rf.getZoom(), 0.9);
    // When the details panel covers the right side, centre the node in the remaining space.
    const panelShift = useGraphUI.getState().panelOpen ? PANEL_WIDTH / 2 / zoom : 0;
    rf.setCenter(p.x + s.w / 2 + panelShift, p.y + s.h / 2, { zoom, duration: 600 });
    setFocus(null);
  }, [focusId, layout, rf, idx, positionOf, setFocus]);

  return (
    <div className={cn("h-full w-full bg-grid", animating && "rf-animate", connectMode && "connect-mode")}>
      <ReactFlow<FlowNode>
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onNodeClick={onNodeClick}
        onNodeDragStop={onNodeDragStop}
        onPaneClick={() => closePanel()}
        onEdgeClick={(_, e) => {
          const ge = graph.edges.find((x) => x.id === e.id);
          if (ge) setEdgeToDelete(ge);
        }}
        onConnect={(c) => setPendingConnection(c)}
        nodesConnectable={connectMode}
        deleteKeyCode={null}
        minZoom={0.15}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
        defaultEdgeOptions={{ type: "default" }}
      >
        <Background variant={BackgroundVariant.Dots} gap={22} size={1} color="rgba(255,255,255,0.035)" />
        <MiniMap
          pannable
          zoomable
          position="bottom-right"
          className="!rounded-xl !border !border-border !bg-bg-elev/90 hidden lg:block"
          nodeColor={(n) => NODE_TYPES[(n.data as FlowNode["data"]).node.type]?.hue ?? "#555"}
          nodeStrokeWidth={0}
          maskColor="rgba(7,9,13,0.75)"
          style={{ width: 170, height: 110 }}
        />
      </ReactFlow>

      <RelationshipDialog
        open={!!pendingConnection}
        onClose={() => setPendingConnection(null)}
        sourceId={pendingConnection?.source ?? null}
        targetId={pendingConnection?.target ?? null}
      />
      <DeleteEdgeDialog edge={edgeToDelete} graph={graph} onClose={() => setEdgeToDelete(null)} />
    </div>
  );
}
