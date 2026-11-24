"use client";

import { ArrowDown, ArrowUp, Network, Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { DualProgressRing, OutcomeBadge, ProgressBar, StatusBadge } from "@/components/progress";
import { PageBody, PageHeader } from "@/components/shell/PageHeader";
import { Badge, Button, cn, Empty, ErrorState, Input, Select, Spinner } from "@/components/ui/primitives";
import { NodeFormDialog } from "@/features/dialogs/NodeFormDialog";
import { useOpenInGraph } from "@/features/graph/useOpenInGraph";
import { fmtPct, OUTCOMES, STATUS, timeAgo } from "@/lib/meta";
import { usePocs } from "@/lib/queries";
import type { NodeStatus, PocSummary, ResearchOutcome } from "@/lib/types";

type SortKey = "title" | "code" | "validation" | "overall" | "importance" | "updated";

const getters: Record<SortKey, (p: PocSummary) => number | string> = {
  title: (p) => p.title.toLowerCase(),
  code: (p) => p.progress.code_progress ?? -1,
  validation: (p) => p.progress.validation_progress ?? -1,
  overall: (p) => p.progress.overall_progress ?? -1,
  importance: (p) => p.importance_weight,
  updated: (p) => p.updated_at,
};

export default function InitiativesPage() {
  const { data, isLoading, error, refetch } = usePocs();
  const openInGraph = useOpenInGraph();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<NodeStatus | "">("");
  const [outcome, setOutcome] = useState<ResearchOutcome | "">("");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "importance", dir: -1 });
  const [creating, setCreating] = useState(false);

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (data ?? [])
      .filter((p) => !s || p.title.toLowerCase().includes(s) || p.description.toLowerCase().includes(s) || (p.owner ?? "").toLowerCase().includes(s))
      .filter((p) => !status || p.status === status)
      .filter((p) => !outcome || p.research_outcome === outcome)
      .sort((a, b) => {
        const va = getters[sort.key](a);
        const vb = getters[sort.key](b);
        return (va < vb ? -1 : va > vb ? 1 : 0) * sort.dir;
      });
  }, [data, q, status, outcome, sort]);

  const th = (key: SortKey, label: string, cls = "") => (
    <th className={cn("px-3 py-2.5 font-medium", cls)}>
      <button
        className="inline-flex items-center gap-1 hover:text-text"
        onClick={() => setSort((s) => ({ key, dir: s.key === key ? (-s.dir as 1 | -1) : key === "title" ? 1 : -1 }))}
      >
        {label}
        {sort.key === key && (sort.dir === 1 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
      </button>
    </th>
  );

  return (
    <PageBody>
      <PageHeader
        title="Initiatives"
        description="Every POC with its current version and its two independent progress measures. Progress is calculated by the backend from weighted deliverables."
        actions={
          <Button variant="primary" onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" /> New initiative
          </Button>
        }
      />
      <div className="px-8 py-5">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="relative w-72">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
            <Input className="pl-9" placeholder="Search name, description, owner…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <Select className="w-44" value={status} onChange={(e) => setStatus(e.target.value as NodeStatus | "")} aria-label="Filter by status">
            <option value="">All statuses</option>
            {(["PLANNED", "IN_PROGRESS", "BLOCKED", "ON_HOLD", "COMPLETED", "ARCHIVED"] as NodeStatus[]).map((s) => (
              <option key={s} value={s}>{STATUS[s].label}</option>
            ))}
          </Select>
          <Select className="w-52" value={outcome} onChange={(e) => setOutcome(e.target.value as ResearchOutcome | "")} aria-label="Filter by outcome">
            <option value="">All outcomes</option>
            {Object.entries(OUTCOMES).map(([k, o]) => (
              <option key={k} value={k}>{o.label}</option>
            ))}
          </Select>
          <span className="ml-auto text-xs text-faint">{rows.length} initiative(s)</span>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-16"><Spinner /></div>
        ) : error ? (
          <ErrorState error={error} onRetry={() => refetch()} />
        ) : rows.length === 0 ? (
          <Empty title="No initiatives match">Try clearing the filters, or create a new initiative.</Empty>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
            <table className="w-full min-w-[1080px] text-sm">
              <thead className="border-b border-border text-left text-xs text-faint">
                <tr>
                  {th("title", "Initiative", "pl-5")}
                  <th className="px-3 py-2.5 font-medium">Owner</th>
                  <th className="px-3 py-2.5 font-medium">Version</th>
                  {th("code", "Code")}
                  {th("validation", "Validation")}
                  {th("overall", "Overall")}
                  <th className="px-3 py-2.5 font-medium">Status</th>
                  <th className="px-3 py-2.5 font-medium">Research outcome</th>
                  {th("importance", "Weight")}
                  {th("updated", "Updated")}
                  <th className="px-3 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((p) => (
                  <tr key={p.id} className={cn("group cursor-pointer transition-colors hover:bg-surface-2/60", p.archived_at && "opacity-50")} onClick={() => openInGraph(p.id)}>
                    <td className="py-3 pl-5 pr-3">
                      <div className="flex items-center gap-3">
                        <DualProgressRing progress={p.progress} size={38} stroke={3.5} gap={2} />
                        <div className="min-w-0">
                          <div className="font-medium text-text">{p.title}</div>
                          <div className="max-w-[300px] truncate text-xs text-muted">{p.description}</div>
                        </div>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-3 text-xs text-muted">{p.owner ?? "—"}</td>
                    <td className="px-3 text-xs text-muted">
                      {p.current_version_label ?? "—"} <span className="text-faint">/ {p.version_count}</span>
                    </td>
                    <td className="w-32 px-3"><Metric value={p.progress.code_progress} color="var(--code)" /></td>
                    <td className="w-32 px-3"><Metric value={p.progress.validation_progress} color="var(--validation)" /></td>
                    <td className="px-3 font-semibold tabular-nums text-text">{fmtPct(p.progress.overall_progress)}</td>
                    <td className="px-3">
                      <div className="flex items-center gap-1.5">
                        <StatusBadge status={p.status} />
                        {p.blocked_count > 0 && <Badge color="var(--danger)">{p.blocked_count} blocked</Badge>}
                      </div>
                    </td>
                    <td className="px-3"><OutcomeBadge outcome={p.research_outcome} /></td>
                    <td className="px-3 tabular-nums text-muted">×{p.importance_weight}</td>
                    <td className="whitespace-nowrap px-3 text-xs text-faint">{timeAgo(p.updated_at)}</td>
                    <td className="px-3">
                      <Button size="sm" variant="ghost" className="opacity-0 group-hover:opacity-100" onClick={(e) => { e.stopPropagation(); openInGraph(p.id); }}>
                        <Network className="h-3.5 w-3.5" /> Graph
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <NodeFormDialog open={creating} onClose={() => setCreating(false)} mode="create" defaultType="POC" allowedTypes={["POC"]} onCreated={(n) => openInGraph(n.id)} />
    </PageBody>
  );
}

function Metric({ value, color }: { value: number | null; color: string }) {
  return (
    <div className="space-y-1">
      <div className="text-xs font-medium tabular-nums" style={{ color }}>{fmtPct(value)}</div>
      <ProgressBar value={value} color={color} height={4} />
    </div>
  );
}
