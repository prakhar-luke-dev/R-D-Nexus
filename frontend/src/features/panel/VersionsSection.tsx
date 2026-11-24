"use client";

import { useQueries } from "@tanstack/react-query";
import { ArrowRight, GitBranch, Plus } from "lucide-react";
import { DualProgressRing } from "@/components/progress";
import { Badge, Button, cn, Spinner } from "@/components/ui/primitives";
import { api } from "@/lib/api";
import { fmtDate, fmtPct } from "@/lib/meta";
import { qk, useApiMutation, useVersions } from "@/lib/queries";
import type { CompletionState } from "@/lib/types";
import { StateChip } from "./DeliverableList";

export function VersionsSection({
  pocId,
  currentId,
  onSelect,
  onCreate,
}: {
  pocId: string;
  currentId?: string;
  onSelect: (id: string) => void;
  onCreate: () => void;
}) {
  const { data: versions, isLoading } = useVersions(pocId);
  const activate = useApiMutation((id: string) => api.activateVersion(id), {
    success: (v) => `${v.version_label} is now the active version`,
  });
  const dels = useQueries({
    queries: (versions ?? []).map((v) => ({ queryKey: qk.deliverables(v.id), queryFn: () => api.deliverables(v.id) })),
  });

  if (isLoading || !versions) return <div className="flex justify-center py-8"><Spinner /></div>;
  const ordered = [...versions].reverse(); // newest first

  // Version comparison: deliverable states per version, by template key.
  const keys: { key: string; title: string; cat: string }[] = [];
  for (const q of dels) for (const d of q.data?.deliverables ?? []) if (!keys.some((k) => k.key === d.key)) keys.push({ key: d.key, title: d.title, cat: d.category });

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        {ordered.map((v, i) => (
          <div
            key={v.id}
            className={cn(
              "rounded-xl border p-3 transition-colors",
              v.id === currentId ? "border-accent/50 bg-accent/5" : "border-border bg-bg-elev/50 hover:border-border-strong",
            )}
          >
            <div className="flex items-center gap-3">
              <DualProgressRing progress={v.progress} size={44} stroke={4} gap={2}>
                <span className="text-[9.5px] font-semibold tabular-nums">{fmtPct(v.progress.overall_progress, 0)}</span>
              </DualProgressRing>
              <button className="min-w-0 flex-1 text-left" onClick={() => onSelect(v.id)}>
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-semibold text-text">{v.version_label}</span>
                  {v.is_active ? <Badge color="var(--ok)">Active</Badge> : <Badge color="var(--text-faint)">Historical</Badge>}
                  {v.blocked_count > 0 && <Badge color="var(--danger)">{v.blocked_count} blocked</Badge>}
                </div>
                <div className="truncate text-xs text-muted">{v.description}</div>
                <div className="mt-0.5 text-[10.5px] text-faint">
                  Created {fmtDate(v.created_at)}
                  {v.superseded_at && ` · superseded ${fmtDate(v.superseded_at)}`} · {v.resource_count} linked resources
                </div>
              </button>
              {!v.is_active && (
                <Button size="sm" variant="ghost" loading={activate.isPending && activate.variables === v.id} onClick={() => activate.mutate(v.id)} title="Make this the active version">
                  Activate
                </Button>
              )}
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2 pl-[56px] text-[11px] tabular-nums">
              <span className="text-code">Code {fmtPct(v.progress.code_progress)}</span>
              <span className="text-validation">Validation {fmtPct(v.progress.validation_progress)}</span>
            </div>
            {i < ordered.length - 1 && (
              <div className="mt-2 flex items-center gap-1 pl-[56px] text-[10.5px] text-faint">
                <GitBranch className="h-3 w-3" /> derived from {ordered[i + 1].version_label}
              </div>
            )}
          </div>
        ))}
        <Button size="sm" variant="outline" onClick={onCreate} className="w-full justify-center">
          <Plus className="h-3.5 w-3.5" /> Create new version
        </Button>
      </div>

      {versions.length > 1 && (
        <div>
          <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-faint">Version comparison</h4>
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-xs">
              <thead className="bg-surface-2 text-faint">
                <tr>
                  <th className="px-2.5 py-2 text-left font-medium">Deliverable</th>
                  {versions.map((v) => (
                    <th key={v.id} className="px-2 py-2 text-left font-medium">{v.version_label}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                <tr className="bg-bg-elev/40">
                  <td className="px-2.5 py-1.5 text-muted">Overall</td>
                  {versions.map((v, i) => {
                    const prev = i > 0 ? versions[i - 1].progress.overall_progress : null;
                    const cur = v.progress.overall_progress;
                    const delta = prev != null && cur != null ? cur - prev : null;
                    return (
                      <td key={v.id} className="px-2 py-1.5 font-semibold tabular-nums text-text">
                        {fmtPct(cur)}
                        {delta != null && (
                          <span className={cn("ml-1 text-[10px] font-normal", delta >= 0 ? "text-ok" : "text-faint")}>
                            {delta >= 0 ? "+" : ""}
                            {delta.toFixed(0)}
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
                {keys.map((k) => (
                  <tr key={k.key}>
                    <td className="max-w-[140px] truncate px-2.5 py-1.5 text-muted" title={k.title}>
                      <span className={cn("mr-1.5 inline-block h-1.5 w-1.5 rounded-full", k.cat === "CODE" ? "bg-code" : "bg-validation")} />
                      {k.title}
                    </td>
                    {dels.map((q, i) => {
                      const d = q.data?.deliverables.find((x) => x.key === k.key);
                      return (
                        <td key={versions[i].id} className="px-2 py-1.5">
                          {!d ? <span className="text-faint">–</span> : d.is_not_applicable ? <span className="text-faint">N/A</span> : <StateChip state={d.state as CompletionState} />}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-1.5 flex items-center gap-1 text-[10.5px] text-faint">
            Each version is scored independently <ArrowRight className="h-3 w-3" /> nothing is inherited from its predecessor.
          </div>
        </div>
      )}
    </div>
  );
}
