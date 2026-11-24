"use client";

import { AlertTriangle } from "lucide-react";
import { useState } from "react";
import { ActivityTimeline } from "@/components/activity-timeline";
import { TrendChart } from "@/components/charts";
import { DualProgressRing, OutcomeBadge, ProgressBar } from "@/components/progress";
import { PageBody, PageHeader } from "@/components/shell/PageHeader";
import { Card, cn, Empty, ErrorState, SectionTitle, Select, Spinner } from "@/components/ui/primitives";
import { useOpenInGraph } from "@/features/graph/useOpenInGraph";
import { fmtPct, OUTCOMES, timeAgo } from "@/lib/meta";
import { useActivity, useOverview, usePocs } from "@/lib/queries";
import type { ResearchOutcome } from "@/lib/types";

const ACTION_FILTERS: { label: string; value: string }[] = [
  { label: "All events", value: "" },
  { label: "Progress & deliverables", value: "DELIVERABLE_UPDATED,PROGRESS_CHANGED" },
  { label: "Evidence", value: "EVIDENCE_ATTACHED,EVIDENCE_REUSED,EVIDENCE_REMOVED" },
  { label: "Versions", value: "VERSION_CREATED,ACTIVE_VERSION_CHANGED" },
  { label: "Scope changes", value: "SCOPE_CHANGED,VERIFICATION_EXCEPTION,IMPORTANCE_CHANGED" },
  { label: "Blockers & status", value: "BLOCKED,UNBLOCKED,INITIATIVE_BLOCKED,STATUS_CHANGED" },
  { label: "Research & experiments", value: "EXPERIMENT_COMPLETED,FINDING_ADDED,OUTCOME_CHANGED,NODE_CREATED" },
];

export default function ActivityPage() {
  const overview = useOverview();
  const pocs = usePocs();
  const [action, setAction] = useState("");
  const feed = useActivity({ action, limit: 150 });
  const openInGraph = useOpenInGraph();
  const o = overview.data;

  return (
    <PageBody>
      <PageHeader title="Activity & overview" description="Where the team stands, what changed, and what needs attention." />
      <div className="space-y-5 px-8 py-5">
        {overview.isLoading ? (
          <div className="flex justify-center py-16"><Spinner /></div>
        ) : overview.error || !o ? (
          <ErrorState error={overview.error} onRetry={() => overview.refetch()} />
        ) : (
          <>
            <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(150px,1fr))]">
              <Card className="col-span-2 flex items-center gap-4 p-4">
                <DualProgressRing progress={o.team_progress} size={72} stroke={6} gap={3}>
                  <span className="text-sm font-semibold tabular-nums">{fmtPct(o.team_progress.overall_progress, 0)}</span>
                </DualProgressRing>
                <div>
                  <div className="text-[11px] uppercase tracking-[0.1em] text-faint">Team progress</div>
                  <div className="text-2xl font-semibold tabular-nums text-text">{fmtPct(o.team_progress.overall_progress)}</div>
                  <div className="text-xs tabular-nums text-muted">
                    Code {fmtPct(o.team_progress.code_progress)} · Validation {fmtPct(o.team_progress.validation_progress)}
                  </div>
                </div>
              </Card>
              <Tile label="Active POCs" value={o.active_poc_count} />
              <Tile label="Concluded POCs" value={o.completed_poc_count} hint="Validated, rejected or production-ready" />
              <Tile label="Blocked initiatives" value={o.blocked.length} danger={o.blocked.length > 0} />
              <Tile label="Experiments (latest)" value={o.latest_experiments.length} />
            </div>

            <div className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
              <Card className="p-5">
                <SectionTitle>Team progress trend</SectionTitle>
                {o.trend.length > 1 ? <TrendChart data={o.trend} /> : <Empty title="Not enough history yet" />}
              </Card>
              <Card className="p-5">
                <SectionTitle>POC comparison</SectionTitle>
                <div className="space-y-3">
                  {(pocs.data ?? []).filter((p) => !p.archived_at).map((p) => (
                    <button key={p.id} onClick={() => openInGraph(p.id)} className="block w-full rounded-lg p-1 text-left hover:bg-surface-2/60">
                      <div className="mb-1 flex items-center justify-between text-xs">
                        <span className="font-medium text-text">
                          {p.title} <span className="text-faint">{p.current_version_label} · ×{p.importance_weight}</span>
                        </span>
                        <span className="font-semibold tabular-nums text-text">{fmtPct(p.progress.overall_progress)}</span>
                      </div>
                      <div className="grid grid-cols-[70px_1fr_44px] items-center gap-x-2 gap-y-1 text-[11px] text-muted">
                        <span>Code</span>
                        <ProgressBar value={p.progress.code_progress} color="var(--code)" height={5} />
                        <span className="text-right tabular-nums">{fmtPct(p.progress.code_progress, 0)}</span>
                        <span>Validation</span>
                        <ProgressBar value={p.progress.validation_progress} color="var(--validation)" height={5} />
                        <span className="text-right tabular-nums">{fmtPct(p.progress.validation_progress, 0)}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </Card>
            </div>

            <div className="grid gap-5 xl:grid-cols-3">
              <Card className="p-5">
                <SectionTitle>Research outcomes</SectionTitle>
                <div className="space-y-2">
                  {(Object.keys(OUTCOMES) as ResearchOutcome[]).filter((k) => o.outcomes[k]).map((k) => (
                    <div key={k} className="flex items-center justify-between">
                      <OutcomeBadge outcome={k} />
                      <span className="text-sm font-semibold tabular-nums text-text">{o.outcomes[k]}</span>
                    </div>
                  ))}
                  <p className="pt-2 text-[11px] leading-4 text-faint">
                    Outcome is separate from progress. A rejected approach that was fully researched is a successful result.
                  </p>
                </div>
              </Card>
              <Card className="p-5">
                <SectionTitle>Needs attention</SectionTitle>
                {o.blocked.length === 0 ? (
                  <div className="text-xs text-muted">Nothing is blocked.</div>
                ) : (
                  <div className="space-y-2">
                    {o.blocked.map((p) => (
                      <button key={p.id} onClick={() => openInGraph(p.id)} className="flex w-full items-start gap-2.5 rounded-xl border border-danger/25 bg-danger/5 px-3 py-2 text-left hover:border-danger/40">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
                        <div>
                          <div className="text-sm font-medium text-text">{p.title} <span className="text-xs text-faint">{p.current_version_label}</span></div>
                          <div className="text-xs text-muted">{p.blocked_count} blocked deliverable(s) · progress held at {fmtPct(p.progress.overall_progress)}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </Card>
              <Card className="p-5">
                <SectionTitle>Latest experiments</SectionTitle>
                <div className="space-y-1.5">
                  {o.latest_experiments.map((e) => (
                    <button key={e.id} onClick={() => openInGraph(e.id)} className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-surface-2/60">
                      <span className="truncate text-[13px] text-text">{e.title}</span>
                      <span className={cn("shrink-0 text-[11px]", e.status === "COMPLETED" ? "text-ok" : "text-muted")}>
                        {e.status === "COMPLETED" ? "completed" : e.status.replace("_", " ").toLowerCase()} · {timeAgo(e.updated_at)}
                      </span>
                    </button>
                  ))}
                </div>
              </Card>
            </div>
          </>
        )}

        <Card className="p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <SectionTitle>Activity feed</SectionTitle>
            <Select className="w-60" value={action} onChange={(e) => setAction(e.target.value)} aria-label="Filter activity">
              {ACTION_FILTERS.map((f) => (
                <option key={f.label} value={f.value}>{f.label}</option>
              ))}
            </Select>
          </div>
          {feed.isLoading ? (
            <div className="flex justify-center py-8"><Spinner /></div>
          ) : feed.data && feed.data.length ? (
            <ActivityTimeline items={feed.data} onSelectNode={openInGraph} />
          ) : (
            <Empty title="No events for this filter" />
          )}
        </Card>
      </div>
    </PageBody>
  );
}

function Tile({ label, value, hint, danger }: { label: string; value: number; hint?: string; danger?: boolean }) {
  return (
    <Card className="p-4">
      <div className="text-[11px] uppercase tracking-[0.1em] text-faint">{label}</div>
      <div className={cn("mt-1 text-2xl font-semibold tabular-nums", danger ? "text-danger" : "text-text")}>{value}</div>
      {hint && <div className="mt-0.5 text-[11px] text-faint">{hint}</div>}
    </Card>
  );
}
