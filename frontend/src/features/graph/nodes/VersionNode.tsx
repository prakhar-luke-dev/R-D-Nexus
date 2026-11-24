"use client";

import type { NodeProps } from "@xyflow/react";
import { AlertTriangle } from "lucide-react";
import { memo } from "react";
import { DualProgressRing } from "@/components/progress";
import { cn } from "@/components/ui/primitives";
import { fmtPct } from "@/lib/meta";
import { type FlowNode, HoverCard, NodeShell } from "./shared";

function VersionNodeImpl({ data, selected }: NodeProps<FlowNode>) {
  const n = data.node;
  const v = n.version;
  const historical = v ? !v.is_active : false;
  const headline = (n.metadata?.headline as string) || n.description;
  return (
    <NodeShell data={data} selected={selected}>
      <div
        className={cn(
          "flex h-full w-full items-center gap-3 rounded-xl border px-3 transition-[border-color,box-shadow]",
          historical ? "border-dashed bg-bg-elev/90" : "bg-surface/95",
          selected
            ? "border-accent/70 shadow-[0_0_0_1px_rgba(124,140,255,0.45)]"
            : historical
              ? "border-border"
              : "border-border-strong shadow-[0_8px_24px_-14px_rgba(0,0,0,0.9)] hover:border-[#3b4759]",
        )}
      >
        <DualProgressRing progress={n.progress} size={52} stroke={4.5} gap={2.5} className={historical ? "opacity-60" : undefined}>
          <span className="text-[10.5px] font-semibold tabular-nums text-text">{fmtPct(n.progress?.overall_progress, 0)}</span>
        </DualProgressRing>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className={cn("text-[13px] font-semibold", historical ? "text-muted" : "text-text")}>
              {v?.version_label ?? n.title}
            </span>
            {historical ? (
              <span className="rounded border border-border px-1 text-[9.5px] uppercase tracking-wider text-faint">historical</span>
            ) : (
              <span className="rounded border border-ok/30 bg-ok/10 px-1 text-[9.5px] uppercase tracking-wider text-ok">active</span>
            )}
          </div>
          <div className={cn("truncate text-[11px] leading-4", historical ? "text-faint" : "text-muted")}>{headline}</div>
        </div>
        {n.blocked_count > 0 && (
          <span title={`${n.blocked_count} blocked`} className="absolute -top-2 right-5 flex items-center gap-1 rounded-full border border-danger/40 bg-[#2a1416] px-1.5 py-0.5 text-[10px] text-danger">
            <AlertTriangle className="h-2.5 w-2.5" /> {n.blocked_count}
          </span>
        )}
      </div>
      <HoverCard text={n.description} />
    </NodeShell>
  );
}

export const VersionNode = memo(VersionNodeImpl);
