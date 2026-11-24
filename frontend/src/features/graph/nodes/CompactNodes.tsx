"use client";

import type { NodeProps } from "@xyflow/react";
import { memo } from "react";
import { StatusDot } from "@/components/progress";
import { cn } from "@/components/ui/primitives";
import { NODE_TYPES } from "@/lib/meta";
import { type FlowNode, HoverCard, type NodeData, NodeShell } from "./shared";

type Variant = "research" | "experiment" | "finding" | "resource";

function CompactCard({ data, selected, variant }: { data: NodeData; selected: boolean; variant: Variant }) {
  const n = data.node;
  const t = NODE_TYPES[n.type];
  const Icon = t.icon;
  const isDoc = n.type === "PAPER" || n.type === "DOCUMENTATION";
  const confidence = n.metadata?.confidence as string | undefined;
  return (
    <NodeShell data={data} selected={selected}>
      <div
        className={cn(
          "relative flex h-full w-full items-center gap-2.5 overflow-hidden border bg-surface/95 pl-2 pr-4 transition-[border-color,box-shadow]",
          variant === "finding" ? "rounded-xl" : isDoc ? "rounded-lg rounded-tr-[14px]" : "rounded-xl",
          selected ? "border-accent/70 shadow-[0_0_0_1px_rgba(124,140,255,0.45)]" : "border-border hover:border-border-strong",
        )}
        style={variant === "finding" ? { boxShadow: selected ? undefined : `inset 3px 0 0 ${t.hue}` } : undefined}
      >
        {isDoc && (
          <span
            className="absolute right-0 top-0 h-3.5 w-3.5 border-b border-l border-border bg-surface-3"
            style={{ borderBottomLeftRadius: 4 }}
          />
        )}
        <span
          className={cn("flex h-8 w-8 shrink-0 items-center justify-center", variant === "experiment" ? "rounded-full" : "rounded-lg")}
          style={{ background: `color-mix(in srgb, ${t.hue} 12%, transparent)`, color: t.hue }}
        >
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[12px] font-medium leading-4 text-text">{n.title}</div>
          <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-faint">
            <span className="uppercase tracking-wider">{t.label}</span>
            {(variant === "experiment" || variant === "research") && (
              <>
                <span>·</span>
                <StatusDot status={n.status} className="h-1.5 w-1.5" />
                <span>{n.status === "COMPLETED" ? "done" : n.status.replace("_", " ").toLowerCase()}</span>
              </>
            )}
            {variant === "finding" && confidence && (
              <>
                <span>·</span>
                <span className={confidence === "CONFIRMED" ? "text-ok" : "text-warn"}>{confidence.toLowerCase()}</span>
              </>
            )}
          </div>
        </div>
      </div>
      <HoverCard text={n.description} />
    </NodeShell>
  );
}

export const ResearchNode = memo(function ResearchNode({ data, selected }: NodeProps<FlowNode>) {
  return <CompactCard data={data} selected={selected} variant="research" />;
});
export const ExperimentNode = memo(function ExperimentNode({ data, selected }: NodeProps<FlowNode>) {
  return <CompactCard data={data} selected={selected} variant="experiment" />;
});
export const FindingNode = memo(function FindingNode({ data, selected }: NodeProps<FlowNode>) {
  return <CompactCard data={data} selected={selected} variant="finding" />;
});
export const ResourceNode = memo(function ResourceNode({ data, selected }: NodeProps<FlowNode>) {
  return <CompactCard data={data} selected={selected} variant="resource" />;
});
