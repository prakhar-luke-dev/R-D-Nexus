"use client";

import { AlertTriangle } from "lucide-react";
import { fmtPct } from "@/lib/meta";
import type { Graph } from "@/lib/types";
import { useGraphUI } from "./store";

/** A glanceable management summary that floats over the canvas. All values come from the API. */
export function TeamHud({ graph }: { graph: Graph }) {
  const pocs = graph.nodes.filter((n) => n.type === "POC");
  const active = pocs.filter((p) => p.poc?.is_active);
  const blocked = pocs.filter((p) => p.blocked_count > 0 || p.status === "BLOCKED");
  const t = graph.team_progress;
  const { select, expand, setFocus } = useGraphUI();
  return (
    <div className="flex items-stretch divide-x divide-border overflow-hidden rounded-xl border border-border bg-surface/90 text-xs shadow-lg shadow-black/30 backdrop-blur">
      <Stat label="Team overall" value={fmtPct(t.overall_progress)} strong />
      <Stat label="Code" value={fmtPct(t.code_progress)} color="var(--code)" />
      <Stat label="Validation" value={fmtPct(t.validation_progress)} color="var(--validation)" />
      <Stat label="Active POCs" value={String(active.length)} />
      <button
        className="px-3 py-2 text-left hover:bg-surface-2 disabled:pointer-events-none"
        disabled={!blocked.length}
        onClick={() => {
          const b = blocked[0];
          if (!b) return;
          expand([b.id]);
          select(b.id, true);
          setFocus(b.id);
        }}
        title={blocked.map((b) => b.title).join(", ")}
      >
        <div className="text-[10px] uppercase tracking-[0.1em] text-faint">Blocked</div>
        <div className={`mt-0.5 flex items-center gap-1 text-sm font-semibold tabular-nums ${blocked.length ? "text-danger" : "text-text"}`}>
          {blocked.length > 0 && <AlertTriangle className="h-3.5 w-3.5" />}
          {blocked.length}
        </div>
      </button>
    </div>
  );
}

function Stat({ label, value, color, strong }: { label: string; value: string; color?: string; strong?: boolean }) {
  return (
    <div className="px-3 py-2">
      <div className="text-[10px] uppercase tracking-[0.1em] text-faint">{label}</div>
      <div className={`mt-0.5 tabular-nums ${strong ? "text-base font-semibold" : "text-sm font-semibold"}`} style={{ color: color ?? "var(--text)" }}>
        {value}
      </div>
    </div>
  );
}
