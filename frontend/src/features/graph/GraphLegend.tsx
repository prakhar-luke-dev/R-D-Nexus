"use client";

import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { cn } from "@/components/ui/primitives";
import { NODE_TYPES, RELATIONSHIPS } from "@/lib/meta";
import type { NodeType, Relationship } from "@/lib/types";

const TYPES: NodeType[] = ["POC", "VERSION", "RESEARCH", "EXPERIMENT", "FINDING", "PAPER", "DOCUMENTATION", "CODE", "DEMO"];
const RELS: Relationship[] = ["CONTAINS", "SHARES_RESOURCE", "PRODUCED", "REFERENCES", "DERIVED_FROM"];

export function GraphLegend() {
  const [open, setOpen] = useState(false);
  return (
    <div className="w-[220px] overflow-hidden rounded-xl border border-border bg-surface/90 shadow-lg shadow-black/30 backdrop-blur">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-faint hover:text-muted">
        Legend
        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", !open && "-rotate-90")} />
      </button>
      {open && (
        <div className="space-y-3 border-t border-border px-3 pb-3 pt-2.5">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-[11px] text-muted">
              <svg width="18" height="18" viewBox="0 0 18 18" className="-rotate-90">
                <circle cx="9" cy="9" r="7.5" fill="none" stroke="var(--code)" strokeWidth="2.2" strokeDasharray="47" strokeDashoffset="14" strokeLinecap="round" />
                <circle cx="9" cy="9" r="4" fill="none" stroke="var(--validation)" strokeWidth="2.2" strokeDasharray="25" strokeDashoffset="12" strokeLinecap="round" />
              </svg>
              <span><span className="text-code">Code</span> outer · <span className="text-validation">Validation</span> inner</span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-x-2 gap-y-1">
            {TYPES.map((t) => {
              const Icon = NODE_TYPES[t].icon;
              return (
                <div key={t} className="flex items-center gap-1.5 text-[11px] text-muted">
                  <Icon className="h-3 w-3" style={{ color: NODE_TYPES[t].hue }} /> {NODE_TYPES[t].plural}
                </div>
              );
            })}
          </div>
          <div className="space-y-1">
            {RELS.map((r) => (
              <div key={r} className="flex items-center gap-2 text-[11px] text-muted">
                <svg width="22" height="6"><line x1="0" y1="3" x2="22" y2="3" stroke={RELATIONSHIPS[r].color} strokeWidth="1.6" strokeDasharray={RELATIONSHIPS[r].dashed ? "4 3" : undefined} /></svg>
                {RELATIONSHIPS[r].label}
              </div>
            ))}
          </div>
          <div className="text-[10.5px] leading-4 text-faint">Click a collapsed node to expand it. Click again to inspect.</div>
        </div>
      )}
    </div>
  );
}
