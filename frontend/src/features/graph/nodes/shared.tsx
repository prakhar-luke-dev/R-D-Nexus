"use client";

import { Handle, Position, type Node } from "@xyflow/react";
import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/components/ui/primitives";
import type { GraphNode } from "@/lib/types";

export interface NodeData extends Record<string, unknown> {
  node: GraphNode;
  childCount: number;
  expanded: boolean;
  isNew: boolean;
  highlighted: boolean; // selected node or one of its neighbours
  onToggle: (id: string) => void;
}

export type FlowNode = Node<NodeData>;

export function Handles() {
  return (
    <>
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
    </>
  );
}

export function ExpandToggle({ data, className }: { data: NodeData; className?: string }) {
  if (!data.childCount) return null;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        data.onToggle(data.node.id);
      }}
      title={data.expanded ? "Collapse branch" : `Expand ${data.childCount} connected item(s)`}
      aria-label={data.expanded ? "Collapse branch" : "Expand branch"}
      className={cn(
        "nodrag absolute -right-3 top-1/2 z-10 flex h-6 min-w-6 -translate-y-1/2 items-center justify-center gap-0.5 rounded-full border px-1 text-[10px] font-semibold tabular-nums shadow-md transition-colors cursor-pointer",
        data.expanded
          ? "border-border-strong bg-surface-3 text-muted hover:text-text"
          : "border-accent/50 bg-[#1a1f3a] text-[#c3cbff] hover:bg-[#232a50]",
        className,
      )}
    >
      {!data.expanded && <span className="pl-0.5">{data.childCount}</span>}
      <ChevronRight className={cn("h-3 w-3 transition-transform duration-200", data.expanded && "rotate-180")} />
    </button>
  );
}

export function NodeShell({
  data,
  selected,
  children,
  className,
  style,
}: {
  data: NodeData;
  selected: boolean;
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={cn(
        "group relative h-full w-full",
        data.isNew && "rf-node-enter",
        className,
      )}
      style={style}
      data-selected={selected || undefined}
    >
      <Handles />
      {children}
      <ExpandToggle data={data} />
    </div>
  );
}

export function HoverCard({ text }: { text: string }) {
  if (!text) return null;
  return (
    <div className="pointer-events-none absolute left-0 top-full z-50 mt-2 w-64 rounded-lg border border-border-strong bg-surface-2/95 p-2.5 text-[11px] leading-4 text-muted opacity-0 shadow-xl shadow-black/40 backdrop-blur transition-opacity delay-300 duration-150 group-hover:opacity-100">
      {text.length > 220 ? `${text.slice(0, 220)}…` : text}
    </div>
  );
}
