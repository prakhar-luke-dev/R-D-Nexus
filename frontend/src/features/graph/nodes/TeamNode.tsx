"use client";

import type { NodeProps } from "@xyflow/react";
import { memo } from "react";
import { DualProgressRing } from "@/components/progress";
import { cn } from "@/components/ui/primitives";
import { fmtPct } from "@/lib/meta";
import { type FlowNode, NodeShell } from "./shared";

function TeamNodeImpl({ data, selected }: NodeProps<FlowNode>) {
  const n = data.node;
  return (
    <NodeShell data={data} selected={selected}>
      <div className="flex h-full w-full flex-col items-center justify-center">
        <div
          className={cn(
            "relative rounded-full p-2 transition-shadow",
            selected ? "shadow-[0_0_0_2px_rgba(124,140,255,0.7),0_0_40px_rgba(124,140,255,0.18)]" : "shadow-[0_0_60px_rgba(124,140,255,0.10)]",
          )}
          style={{ background: "radial-gradient(circle at 50% 35%, #1a2030, #0d1118 70%)" }}
        >
          <DualProgressRing progress={n.progress} size={140} stroke={9} gap={5}>
            <div className="text-center">
              <div className="text-[26px] font-semibold leading-none tracking-tight text-text tabular-nums">
                {fmtPct(n.progress?.overall_progress, 1)}
              </div>
              <div className="mt-1 text-[10px] font-medium uppercase tracking-[0.12em] text-faint">overall</div>
            </div>
          </DualProgressRing>
        </div>
        <div className="mt-2.5 text-center">
          <div className="text-[13px] font-semibold text-text">{n.title}</div>
          <div className="mt-0.5 flex items-center justify-center gap-2 text-[10.5px] tabular-nums">
            <span className="text-code">{fmtPct(n.progress?.code_progress)}</span>
            <span className="text-faint">·</span>
            <span className="text-validation">{fmtPct(n.progress?.validation_progress)}</span>
          </div>
        </div>
      </div>
    </NodeShell>
  );
}

export const TeamNode = memo(TeamNodeImpl);
