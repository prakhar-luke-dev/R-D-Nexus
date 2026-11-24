"use client";

import type { ReactNode } from "react";
import { fmtPct, OUTCOMES, STATUS } from "@/lib/meta";
import type { NodeStatus, Progress, ResearchOutcome } from "@/lib/types";
import { Badge, cn } from "./ui/primitives";

/**
 * Two independent concentric rings: outer = code progress (teal), inner = validation (amber).
 * Values come from the backend and are never combined into one ring.
 */
export function DualProgressRing({
  progress,
  size = 64,
  stroke,
  gap,
  children,
  className,
}: {
  progress: Progress | null | undefined;
  size?: number;
  stroke?: number;
  gap?: number;
  children?: ReactNode;
  className?: string;
}) {
  const sw = stroke ?? Math.max(3, Math.round(size / 15));
  const g = gap ?? Math.max(2, Math.round(sw * 0.6));
  const c = size / 2;
  const r1 = c - sw / 2;
  const r2 = r1 - sw - g;
  return (
    <div className={cn("relative shrink-0", className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
        <Ring r={r1} c={c} sw={sw} value={progress?.code_progress} color="var(--code)" track="var(--code-dim)" />
        <Ring r={r2} c={c} sw={sw} value={progress?.validation_progress} color="var(--validation)" track="var(--validation-dim)" />
      </svg>
      {children && <div className="absolute inset-0 flex items-center justify-center">{children}</div>}
      <span className="sr-only">
        Code {fmtPct(progress?.code_progress)}, validation {fmtPct(progress?.validation_progress)}
      </span>
    </div>
  );
}

function Ring({ r, c, sw, value, color, track }: { r: number; c: number; sw: number; value: number | null | undefined; color: string; track: string }) {
  const circ = 2 * Math.PI * r;
  const v = value ?? 0;
  const off = circ * (1 - Math.min(Math.max(v, 0), 100) / 100);
  return (
    <>
      <circle cx={c} cy={c} r={r} fill="none" stroke={track} strokeWidth={sw} strokeDasharray={value == null ? "2 3" : undefined} />
      {value != null && v > 0 && (
        <circle
          cx={c}
          cy={c}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={sw}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={off}
          style={{ transition: "stroke-dashoffset 700ms cubic-bezier(0.2, 0.8, 0.2, 1)" }}
        />
      )}
    </>
  );
}

export function ProgressBar({ value, color, height = 6 }: { value: number | null | undefined; color: string; height?: number }) {
  return (
    <div className="w-full overflow-hidden rounded-full bg-surface-3" style={{ height }}>
      <div
        className="h-full rounded-full"
        style={{ width: `${Math.min(Math.max(value ?? 0, 0), 100)}%`, background: color, transition: "width 600ms cubic-bezier(0.2,0.8,0.2,1)" }}
      />
    </div>
  );
}

/** Compact legend-style readout of both dimensions plus the overall value. */
export function ProgressSummary({ progress, compact }: { progress: Progress | null | undefined; compact?: boolean }) {
  const rows = [
    { label: "Code", value: progress?.code_progress, color: "var(--code)" },
    { label: "Validation", value: progress?.validation_progress, color: "var(--validation)" },
  ];
  return (
    <div className={cn("space-y-2", compact && "space-y-1.5")}>
      {rows.map((r) => (
        <div key={r.label} className="flex items-center gap-3">
          <span className="flex w-20 items-center gap-1.5 text-xs text-muted">
            <span className="h-2 w-2 rounded-full" style={{ background: r.color }} />
            {r.label}
          </span>
          <ProgressBar value={r.value} color={r.color} />
          <span className="w-12 text-right text-xs font-medium tabular-nums text-text">{fmtPct(r.value)}</span>
        </div>
      ))}
    </div>
  );
}

export function StatusBadge({ status }: { status: NodeStatus }) {
  const s = STATUS[status] ?? { label: status, color: "var(--text-faint)" };
  return (
    <Badge color={s.color}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: s.color }} />
      {s.label}
    </Badge>
  );
}

export function StatusDot({ status, className }: { status: NodeStatus; className?: string }) {
  const s = STATUS[status];
  return <span title={s?.label} className={cn("inline-block h-2 w-2 rounded-full", className)} style={{ background: s?.color }} />;
}

export function OutcomeBadge({ outcome }: { outcome: ResearchOutcome }) {
  const o = OUTCOMES[outcome] ?? { label: outcome, color: "var(--text-faint)", hint: "" };
  return (
    <Badge color={o.color} title={o.hint}>
      {o.label}
    </Badge>
  );
}

export function RingLegend({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-3 text-[11px] text-muted", className)}>
      <span className="flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full bg-code" /> Code (outer)
      </span>
      <span className="flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full bg-validation" /> Validation (inner)
      </span>
    </div>
  );
}
