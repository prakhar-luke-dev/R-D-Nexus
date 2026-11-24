"use client";

import {
  Archive,
  ArrowRightLeft,
  Ban,
  CircleDot,
  FilePlus2,
  FlaskConical,
  GitBranch,
  Lightbulb,
  Link2,
  type LucideIcon,
  Paperclip,
  Plus,
  Scale,
  Scissors,
  ShieldCheck,
  Trash2,
  TrendingUp,
} from "lucide-react";
import { timeAgo } from "@/lib/meta";
import type { Activity } from "@/lib/types";
import { cn } from "./ui/primitives";

const ACTION_ICON: Record<string, { icon: LucideIcon; color: string }> = {
  POC_CREATED: { icon: Plus, color: "var(--accent)" },
  VERSION_CREATED: { icon: GitBranch, color: "var(--accent)" },
  ACTIVE_VERSION_CHANGED: { icon: ArrowRightLeft, color: "var(--accent)" },
  DELIVERABLE_UPDATED: { icon: CircleDot, color: "var(--code)" },
  PROGRESS_CHANGED: { icon: TrendingUp, color: "var(--code)" },
  EVIDENCE_ATTACHED: { icon: Paperclip, color: "var(--validation)" },
  EVIDENCE_REUSED: { icon: Paperclip, color: "var(--validation)" },
  EVIDENCE_REMOVED: { icon: Paperclip, color: "var(--text-faint)" },
  SCOPE_CHANGED: { icon: Scissors, color: "var(--warn)" },
  VERIFICATION_EXCEPTION: { icon: ShieldCheck, color: "var(--warn)" },
  BLOCKED: { icon: Ban, color: "var(--danger)" },
  INITIATIVE_BLOCKED: { icon: Ban, color: "var(--danger)" },
  UNBLOCKED: { icon: Ban, color: "var(--ok)" },
  IMPORTANCE_CHANGED: { icon: Scale, color: "var(--info)" },
  OUTCOME_CHANGED: { icon: Lightbulb, color: "var(--validation)" },
  FINDING_ADDED: { icon: Lightbulb, color: "var(--validation)" },
  EXPERIMENT_COMPLETED: { icon: FlaskConical, color: "#c4b5fd" },
  NODE_CREATED: { icon: FilePlus2, color: "var(--info)" },
  RELATIONSHIP_CREATED: { icon: Link2, color: "var(--info)" },
  RELATIONSHIP_REMOVED: { icon: Link2, color: "var(--text-faint)" },
  NODE_ARCHIVED: { icon: Archive, color: "var(--text-faint)" },
  NODE_DELETED: { icon: Trash2, color: "var(--danger)" },
};

export function ActivityTimeline({
  items,
  dense,
  onSelectNode,
}: {
  items: Activity[];
  dense?: boolean;
  onSelectNode?: (id: string) => void;
}) {
  return (
    <ol className="relative">
      {items.map((a, i) => {
        const meta = ACTION_ICON[a.action] ?? { icon: CircleDot, color: "var(--text-faint)" };
        const Icon = meta.icon;
        return (
          <li key={a.id} className={cn("relative flex gap-3", dense ? "pb-3" : "pb-4")}>
            {i < items.length - 1 && <span className="absolute left-[11px] top-6 bottom-0 w-px bg-border" />}
            <span
              className="relative z-10 mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border bg-surface-2"
              style={{ color: meta.color }}
            >
              <Icon className="h-3 w-3" />
            </span>
            <div className="min-w-0 flex-1">
              <div className={cn("text-text", dense ? "text-xs leading-5" : "text-[13px] leading-5")}>{a.description}</div>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-faint">
                <span>{a.actor_id}</span>
                <span>·</span>
                <span title={new Date(a.created_at).toLocaleString()}>{timeAgo(a.created_at)}</span>
                {onSelectNode && a.node_id && a.node_title && (
                  <>
                    <span>·</span>
                    <button className="text-muted hover:text-accent" onClick={() => onSelectNode(a.node_id!)}>
                      {a.node_title}
                    </button>
                  </>
                )}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
