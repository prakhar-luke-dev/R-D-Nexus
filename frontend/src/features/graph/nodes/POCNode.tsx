"use client";

import type { NodeProps } from "@xyflow/react";
import { AlertTriangle } from "lucide-react";
import { memo } from "react";
import { DualProgressRing, StatusDot } from "@/components/progress";
import { cn } from "@/components/ui/primitives";
import { fmtPct, OUTCOMES, STATUS } from "@/lib/meta";
import { type FlowNode, HoverCard, NodeShell } from "./shared";

function POCNodeImpl({ data, selected }: NodeProps<FlowNode>) {
  const n = data.node;
  const poc = n.poc;
  const outcome = poc ? OUTCOMES[poc.research_outcome] : null;
  return (
    <NodeShell data={data} selected={selected}>
      <div
        className={cn(
          "flex h-full w-full items-center gap-3.5 rounded-2xl border bg-surface/95 px-3.5 backdrop-blur transition-[border-color,box-shadow]",
          selected
            ? "border-accent/70 shadow-[0_0_0_1px_rgba(124,140,255,0.5),0_12px_40px_-12px_rgba(124,140,255,0.35)]"
            : "border-border-strong shadow-[0_10px_30px_-14px_rgba(0,0,0,0.8)] hover:border-[#3b4759]",
        )}
      >
        <DualProgressRing progress={n.progress} size={72} stroke={6} gap={3}>
          <span className="text-[13px] font-semibold tabular-nums text-text">{fmtPct(n.progress?.overall_progress, 0)}</span>
        </DualProgressRing>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-[9.5px] font-semibold uppercase tracking-[0.12em] text-faint">POC</span>
            {poc?.active_version_label && (
              <span className="rounded bg-surface-3 px-1 text-[10px] font-medium text-muted">{poc.active_version_label}</span>
            )}
          </div>
          <div className="truncate text-[14px] font-semibold leading-5 text-text">{n.title}</div>
          <div className="mt-1 flex min-w-0 items-center gap-2 text-[10.5px] text-muted">
            <span className="flex shrink-0 items-center gap-1 whitespace-nowrap">
              <StatusDot status={n.status} />
              {STATUS[n.status]?.label}
            </span>
            {outcome && poc?.research_outcome !== "PENDING" && (
              <span className="truncate" style={{ color: outcome.color }}>
                {outcome.label}
              </span>
            )}
          </div>
        </div>
        {n.blocked_count > 0 && (
          <span
            title={`${n.blocked_count} blocked deliverable(s)`}
            className="absolute -top-2 right-5 flex items-center gap-1 rounded-full border border-danger/40 bg-[#2a1416] px-1.5 py-0.5 text-[10px] font-medium text-danger"
          >
            <AlertTriangle className="h-2.5 w-2.5" /> {n.blocked_count}
          </span>
        )}
        {poc && (
          <span
            title="Importance weight in team progress"
            className="absolute -top-2 left-4 rounded-full border border-border bg-surface-2 px-1.5 py-0.5 text-[9.5px] font-medium text-muted"
          >
            ×{poc.importance_weight}
          </span>
        )}
      </div>
      <HoverCard text={n.description} />
    </NodeShell>
  );
}

export const POCNode = memo(POCNodeImpl);
