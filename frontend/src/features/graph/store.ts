"use client";

import { create } from "zustand";
import type { NodeStatus, NodeType, Relationship } from "@/lib/types";

export interface GraphFilters {
  hiddenTypes: NodeType[];
  statuses: NodeStatus[]; // empty = all
  progressMin: number;
  progressMax: number;
  hiddenRelationships: Relationship[];
  showHistorical: boolean;
}

export const DEFAULT_FILTERS: GraphFilters = {
  hiddenTypes: [],
  statuses: [],
  progressMin: 0,
  progressMax: 100,
  hiddenRelationships: [],
  showHistorical: true,
};

interface GraphUIState {
  expanded: string[];
  selectedId: string | null;
  panelOpen: boolean;
  filters: GraphFilters;
  connectMode: boolean;
  presentation: boolean;
  /** Bumped to ask the canvas to fit the view (with optional focus ids). */
  fitRequest: { seq: number; ids?: string[] };
  /** Node to focus after the next layout (search result). */
  focusId: string | null;
  layoutReset: number;

  toggle: (id: string) => void;
  expand: (ids: string[]) => void;
  collapse: (id: string) => void;
  setExpanded: (ids: string[]) => void;
  select: (id: string | null, openPanel?: boolean) => void;
  closePanel: () => void;
  setFilters: (f: Partial<GraphFilters>) => void;
  resetFilters: () => void;
  setConnectMode: (v: boolean) => void;
  setPresentation: (v: boolean) => void;
  requestFit: (ids?: string[]) => void;
  setFocus: (id: string | null) => void;
  resetLayout: () => void;
}

export const useGraphUI = create<GraphUIState>((set) => ({
  expanded: [],
  selectedId: null,
  panelOpen: false,
  filters: DEFAULT_FILTERS,
  connectMode: false,
  presentation: false,
  fitRequest: { seq: 0 },
  focusId: null,
  layoutReset: 0,

  toggle: (id) =>
    set((s) => ({ expanded: s.expanded.includes(id) ? s.expanded.filter((x) => x !== id) : [...s.expanded, id] })),
  expand: (ids) => set((s) => ({ expanded: Array.from(new Set([...s.expanded, ...ids])) })),
  collapse: (id) => set((s) => ({ expanded: s.expanded.filter((x) => x !== id) })),
  setExpanded: (ids) => set({ expanded: ids }),
  select: (id, openPanel = true) => set({ selectedId: id, panelOpen: !!id && openPanel }),
  closePanel: () => set({ panelOpen: false, selectedId: null }),
  setFilters: (f) => set((s) => ({ filters: { ...s.filters, ...f } })),
  resetFilters: () => set({ filters: DEFAULT_FILTERS }),
  setConnectMode: (v) => set({ connectMode: v }),
  setPresentation: (v) => set({ presentation: v }),
  requestFit: (ids) => set((s) => ({ fitRequest: { seq: s.fitRequest.seq + 1, ids } })),
  setFocus: (id) => set({ focusId: id }),
  resetLayout: () => set((s) => ({ layoutReset: s.layoutReset + 1 })),
}));

export const activeFilterCount = (f: GraphFilters) =>
  f.hiddenTypes.length +
  f.statuses.length +
  (f.progressMin > 0 || f.progressMax < 100 ? 1 : 0) +
  f.hiddenRelationships.length +
  (f.showHistorical ? 0 : 1);
