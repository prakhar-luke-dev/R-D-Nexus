"use client";

import { useReactFlow } from "@xyflow/react";
import {
  ChevronsDownUp,
  ChevronsUpDown,
  Filter,
  Link2,
  Maximize,
  Plus,
  Presentation,
  RotateCcw,
  Search,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button, cn } from "@/components/ui/primitives";
import { api } from "@/lib/api";
import { NODE_TYPES, RELATIONSHIPS, STATUS } from "@/lib/meta";
import { useApiMutation } from "@/lib/queries";
import type { Graph, NodeStatus, NodeType, Relationship } from "@/lib/types";
import { NodeFormDialog } from "../dialogs/NodeFormDialog";
import { RelationshipDialog } from "../dialogs/RelationshipDialog";
import { indexGraph, pathToRoot } from "./model";
import { activeFilterCount, useGraphUI } from "./store";

const FIT_PADDING = { top: "150px", bottom: "48px", left: "48px", right: "48px" } as const;

const FILTER_TYPES: NodeType[] = ["POC", "VERSION", "RESEARCH", "EXPERIMENT", "FINDING", "PAPER", "DOCUMENTATION", "CODE", "DEMO"];
const FILTER_STATUSES: NodeStatus[] = ["PLANNED", "IN_PROGRESS", "BLOCKED", "ON_HOLD", "COMPLETED", "HISTORICAL"];
const FILTER_RELS: Relationship[] = ["DERIVED_FROM", "REFERENCES", "SHARES_RESOURCE", "PRODUCED", "CONTAINS"];

export function GraphToolbar({ graph }: { graph: Graph }) {
  const ui = useGraphUI();
  const idx = useMemo(() => indexGraph(graph), [graph]);
  const [addOpen, setAddOpen] = useState(false);
  const [relOpen, setRelOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const expandAll = () => ui.setExpanded([...idx.children.keys()]);
  const collapseAll = () => {
    ui.setExpanded([]);
    ui.closePanel();
    ui.requestFit();
  };
  const reset = () => {
    ui.setExpanded([]);
    ui.closePanel();
    ui.resetFilters();
    ui.setConnectMode(false);
    ui.requestFit();
  };
  const pinned = graph.nodes.filter((n) => n.position);
  const resetLayout = useApiMutation(
    () => Promise.all(pinned.map((n) => api.patchNode(n.id, { position: null }))),
    { success: "Manual positions cleared", onSuccess: () => ui.resetLayout() },
  );

  return (
    <>
      <div className="pointer-events-none absolute inset-x-3 top-3 z-20 flex items-start gap-2">
        <SearchBox graph={graph} onPick={(id) => {
          ui.expand(pathToRoot(id, graph.root_id, idx));
          ui.select(id, true);
          ui.setFocus(id);
        }} />
        <div className="pointer-events-auto flex items-center gap-0.5 rounded-xl border border-border bg-surface/90 p-1 shadow-lg shadow-black/30 backdrop-blur">
          <ToolButton title="Filters" onClick={() => setFiltersOpen((v) => !v)} active={filtersOpen || activeFilterCount(ui.filters) > 0}>
            <Filter className="h-4 w-4" />
            {activeFilterCount(ui.filters) > 0 && <span className="text-[10px] font-semibold">{activeFilterCount(ui.filters)}</span>}
          </ToolButton>
          <Divider />
          <ToolButton title="Expand all branches" onClick={expandAll}><ChevronsUpDown className="h-4 w-4" /></ToolButton>
          <ToolButton title="Collapse all branches" onClick={collapseAll}><ChevronsDownUp className="h-4 w-4" /></ToolButton>
          <ToolButton title="Fit graph to screen" onClick={() => ui.requestFit()}><Maximize className="h-4 w-4" /></ToolButton>
          <ToolButton title="Reset view (collapse, clear filters)" onClick={reset}><RotateCcw className="h-4 w-4" /></ToolButton>
          <Divider />
          <ToolButton title={ui.connectMode ? "Exit connect mode" : "Connect mode: drag between node handles to create a relationship"} onClick={() => ui.setConnectMode(!ui.connectMode)} active={ui.connectMode}>
            <Link2 className="h-4 w-4" />
          </ToolButton>
          <ToolButton title="Presentation mode" onClick={() => { ui.setPresentation(true); ui.closePanel(); ui.requestFit(); }}>
            <Presentation className="h-4 w-4" />
          </ToolButton>
        </div>
        <div className="pointer-events-auto ml-auto flex items-center gap-2">
          <Button variant="outline" size="md" className="bg-surface/90 backdrop-blur" onClick={() => setRelOpen(true)}>
            <Link2 className="h-4 w-4" /> Relationship
          </Button>
          <Button variant="primary" size="md" onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4" /> Add node
          </Button>
        </div>
      </div>

      {ui.connectMode && (
        <div className="absolute left-1/2 top-16 z-20 -translate-x-1/2 rounded-full border border-accent/40 bg-[#151a33]/95 px-3.5 py-1.5 text-xs text-[#c3cbff] shadow-lg">
          Connect mode: drag from a node’s right handle to another node.
          <button className="ml-2 text-faint hover:text-text" onClick={() => ui.setConnectMode(false)}>Exit</button>
        </div>
      )}

      {filtersOpen && <FilterPanel onClose={() => setFiltersOpen(false)} pinnedCount={pinned.length} onResetLayout={() => resetLayout.mutate(undefined)} />}

      <NodeFormDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        mode="create"
        defaultType="POC"
        defaultParentId={ui.selectedId}
        onCreated={(n) => {
          const parent = ui.selectedId;
          if (parent) ui.expand(pathToRoot(parent, graph.root_id, idx).concat(parent));
          ui.select(n.id, true);
          ui.setFocus(n.id);
        }}
      />
      <RelationshipDialog open={relOpen} onClose={() => setRelOpen(false)} sourceId={ui.selectedId} targetId={null} />
    </>
  );
}

export function ZoomControls() {
  const rf = useReactFlow();
  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-border bg-surface/90 shadow-lg shadow-black/30 backdrop-blur">
      <button className="p-2 text-muted hover:bg-surface-2 hover:text-text" onClick={() => rf.zoomIn({ duration: 200 })} title="Zoom in" aria-label="Zoom in"><ZoomIn className="h-4 w-4" /></button>
      <button className="border-t border-border p-2 text-muted hover:bg-surface-2 hover:text-text" onClick={() => rf.zoomOut({ duration: 200 })} title="Zoom out" aria-label="Zoom out"><ZoomOut className="h-4 w-4" /></button>
      <button className="border-t border-border p-2 text-muted hover:bg-surface-2 hover:text-text" onClick={() => rf.fitView({ padding: FIT_PADDING, maxZoom: 1, duration: 400 })} title="Fit" aria-label="Fit view"><Maximize className="h-4 w-4" /></button>
    </div>
  );
}

function ToolButton({ children, title, onClick, active }: { children: React.ReactNode; title: string; onClick: () => void; active?: boolean }) {
  return (
    <button
      title={title}
      aria-label={title}
      onClick={onClick}
      className={cn(
        "flex h-8 min-w-8 items-center justify-center gap-1 rounded-lg px-2 text-muted transition-colors hover:bg-surface-2 hover:text-text cursor-pointer",
        active && "bg-accent/15 text-[#c3cbff] hover:bg-accent/20",
      )}
    >
      {children}
    </button>
  );
}

const Divider = () => <span className="mx-0.5 h-5 w-px bg-border" />;

function SearchBox({ graph, onPick }: { graph: Graph; onPick: (id: string) => void }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        ref.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return [];
    return graph.nodes
      .filter((n) => n.title.toLowerCase().includes(s) || n.description.toLowerCase().includes(s) || n.tags.some((t) => t.toLowerCase().includes(s)))
      .sort((a, b) => Number(b.title.toLowerCase().startsWith(s)) - Number(a.title.toLowerCase().startsWith(s)))
      .slice(0, 8);
  }, [q, graph.nodes]);

  const pick = (id: string) => {
    onPick(id);
    setOpen(false);
    setQ("");
    ref.current?.blur();
  };

  return (
    <div className="pointer-events-auto relative w-[min(340px,40vw)]">
      <div className="flex h-10 items-center gap-2 rounded-xl border border-border bg-surface/90 px-3 shadow-lg shadow-black/30 backdrop-blur focus-within:border-accent/50">
        <Search className="h-4 w-4 text-faint" />
        <input
          ref={ref}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
            setHi(0);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") setHi((h) => Math.min(h + 1, results.length - 1));
            if (e.key === "ArrowUp") setHi((h) => Math.max(h - 1, 0));
            if (e.key === "Enter" && results[hi]) pick(results[hi].id);
            if (e.key === "Escape") ref.current?.blur();
          }}
          placeholder="Search nodes…"
          className="h-full flex-1 bg-transparent text-sm text-text placeholder:text-faint focus:outline-none"
          aria-label="Search nodes"
        />
        {q ? (
          <button onClick={() => setQ("")} aria-label="Clear search"><X className="h-3.5 w-3.5 text-faint" /></button>
        ) : (
          <kbd className="rounded border border-border px-1.5 text-[10px] text-faint">⌘K</kbd>
        )}
      </div>
      {open && q && (
        <div className="absolute left-0 right-0 top-11 overflow-hidden rounded-xl border border-border-strong bg-surface-2/98 py-1 shadow-2xl shadow-black/50 backdrop-blur">
          {results.length === 0 && <div className="px-3 py-2.5 text-xs text-faint">No matches</div>}
          {results.map((n, i) => {
            const t = NODE_TYPES[n.type];
            const Icon = t.icon;
            return (
              <button
                key={n.id}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(n.id)}
                onMouseEnter={() => setHi(i)}
                className={cn("flex w-full items-center gap-2.5 px-3 py-2 text-left", i === hi && "bg-surface-3")}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: t.hue }} />
                <span className="min-w-0 flex-1 truncate text-[13px] text-text">{n.title}</span>
                <span className="text-[10px] uppercase tracking-wider text-faint">{t.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function FilterPanel({ onClose, pinnedCount, onResetLayout }: { onClose: () => void; pinnedCount: number; onResetLayout: () => void }) {
  const { filters, setFilters, resetFilters } = useGraphUI();
  const toggleIn = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  return (
    <div className="absolute left-3 top-16 z-30 w-[340px] rounded-2xl border border-border-strong bg-surface/97 p-4 shadow-2xl shadow-black/50 backdrop-blur">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-text">Filters</h3>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" onClick={resetFilters}>Clear</Button>
          <Button size="icon" variant="ghost" onClick={onClose} aria-label="Close filters"><X className="h-4 w-4" /></Button>
        </div>
      </div>
      <div className="space-y-4">
        <FilterGroup label="Node types">
          {FILTER_TYPES.map((t) => {
            const on = !filters.hiddenTypes.includes(t);
            const Icon = NODE_TYPES[t].icon;
            return (
              <Chip key={t} on={on} onClick={() => setFilters({ hiddenTypes: toggleIn(filters.hiddenTypes, t) })}>
                <Icon className="h-3 w-3" style={{ color: on ? NODE_TYPES[t].hue : undefined }} /> {NODE_TYPES[t].plural}
              </Chip>
            );
          })}
        </FilterGroup>
        <FilterGroup label="Status" hint="None selected = all">
          {FILTER_STATUSES.map((s) => (
            <Chip key={s} on={filters.statuses.includes(s)} onClick={() => setFilters({ statuses: toggleIn(filters.statuses, s) })}>
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: STATUS[s].color }} /> {STATUS[s].label}
            </Chip>
          ))}
        </FilterGroup>
        <FilterGroup label={`Overall progress: ${filters.progressMin}–${filters.progressMax}%`} hint="Applies to POCs and versions">
          <div className="flex w-full items-center gap-2">
            <input type="range" min={0} max={100} step={5} value={filters.progressMin} onChange={(e) => setFilters({ progressMin: Math.min(Number(e.target.value), filters.progressMax) })} className="flex-1 accent-[var(--accent)]" aria-label="Minimum progress" />
            <input type="range" min={0} max={100} step={5} value={filters.progressMax} onChange={(e) => setFilters({ progressMax: Math.max(Number(e.target.value), filters.progressMin) })} className="flex-1 accent-[var(--accent)]" aria-label="Maximum progress" />
          </div>
        </FilterGroup>
        <FilterGroup label="Relationships shown">
          {FILTER_RELS.map((r) => (
            <Chip key={r} on={!filters.hiddenRelationships.includes(r)} onClick={() => setFilters({ hiddenRelationships: toggleIn(filters.hiddenRelationships, r) })}>
              <span className="inline-block h-px w-3" style={{ background: RELATIONSHIPS[r].color, borderTop: RELATIONSHIPS[r].dashed ? `1px dashed ${RELATIONSHIPS[r].color}` : undefined }} />
              {RELATIONSHIPS[r].label}
            </Chip>
          ))}
        </FilterGroup>
        <label className="flex items-center gap-2 text-xs text-muted">
          <input type="checkbox" className="accent-[var(--accent)]" checked={filters.showHistorical} onChange={(e) => setFilters({ showHistorical: e.target.checked })} />
          Show historical versions
        </label>
        {pinnedCount > 0 && (
          <div className="flex items-center justify-between border-t border-border pt-3 text-xs text-muted">
            <span>{pinnedCount} manually positioned node(s)</span>
            <Button size="sm" variant="outline" onClick={onResetLayout}>Reset layout</Button>
          </div>
        )}
      </div>
    </div>
  );
}

function FilterGroup({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-faint">{label}</span>
        {hint && <span className="text-[10px] text-faint">{hint}</span>}
      </div>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[11.5px] transition-colors cursor-pointer",
        on ? "border-border-strong bg-surface-3 text-text" : "border-border text-faint hover:text-muted",
      )}
    >
      {children}
    </button>
  );
}
