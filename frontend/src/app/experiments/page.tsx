"use client";

import { FlaskConical, Network, Pencil, Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { MetricBars } from "@/components/charts";
import { StatusBadge } from "@/components/progress";
import { PageBody, PageHeader } from "@/components/shell/PageHeader";
import { Button, Card, cn, Empty, ErrorState, Input, SectionTitle, Select, Spinner } from "@/components/ui/primitives";
import { NodeFormDialog } from "@/features/dialogs/NodeFormDialog";
import { useOpenInGraph } from "@/features/graph/useOpenInGraph";
import { fmtDate, NODE_TYPES } from "@/lib/meta";
import { useExperiments } from "@/lib/queries";
import type { KnowledgeItem } from "@/lib/types";

const metricsOf = (i: KnowledgeItem) => (i.node.metadata?.metrics ?? {}) as Record<string, number | string>;

export default function ExperimentsPage() {
  const { data, isLoading, error, refetch } = useExperiments();
  const openInGraph = useOpenInGraph();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [dialog, setDialog] = useState<null | "create" | "edit">(null);

  const items = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (data ?? []).filter((i) => (!status || i.node.status === status) && (!s || i.node.title.toLowerCase().includes(s) || i.node.description.toLowerCase().includes(s)));
  }, [data, q, status]);

  // Metric comparison: numeric metrics shared by at least two experiments are comparable.
  const metricKeys = useMemo(() => {
    const c = new Map<string, number>();
    for (const i of data ?? []) for (const [k, v] of Object.entries(metricsOf(i))) if (typeof v === "number") c.set(k, (c.get(k) ?? 0) + 1);
    return [...c.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
  }, [data]);
  const [metric, setMetric] = useState<string>("");
  const activeMetric = metric || metricKeys.find((k) => (data ?? []).filter((i) => typeof metricsOf(i)[k] === "number").length > 1) || metricKeys[0] || "";
  const chartRows = (data ?? [])
    .filter((i) => typeof metricsOf(i)[activeMetric] === "number")
    .map((i) => ({ name: i.node.title, value: metricsOf(i)[activeMetric] as number }));

  const current = (data ?? []).find((i) => i.node.id === selected) ?? items[0];

  return (
    <PageBody>
      <PageHeader
        title="Experiments"
        description="Every experiment with its objective, configuration, results and the version it belongs to."
        actions={<Button variant="primary" onClick={() => setDialog("create")}><Plus className="h-4 w-4" /> New experiment</Button>}
      />
      <div className="space-y-5 px-8 py-5">
        {isLoading ? (
          <div className="flex justify-center py-16"><Spinner /></div>
        ) : error ? (
          <ErrorState error={error} onRetry={() => refetch()} />
        ) : (
          <>
            {metricKeys.length > 0 && (
              <Card className="p-5">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-semibold text-text">Result comparison: {activeMetric}</h2>
                    <p className="text-xs text-muted">{chartRows.length} experiment(s) report this metric.</p>
                  </div>
                  <Select className="w-64" value={activeMetric} onChange={(e) => setMetric(e.target.value)} aria-label="Metric">
                    {metricKeys.map((k) => (
                      <option key={k} value={k}>{k}</option>
                    ))}
                  </Select>
                </div>
                <MetricBars rows={chartRows} metric={activeMetric} />
              </Card>
            )}

            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
              <div>
                <div className="mb-3 flex items-center gap-2">
                  <div className="relative w-72">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
                    <Input className="pl-9" placeholder="Search experiments…" value={q} onChange={(e) => setQ(e.target.value)} />
                  </div>
                  <Select className="w-44" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
                    <option value="">All statuses</option>
                    <option value="PLANNED">Planned</option>
                    <option value="IN_PROGRESS">In progress</option>
                    <option value="COMPLETED">Completed</option>
                    <option value="BLOCKED">Blocked</option>
                  </Select>
                </div>
                {items.length === 0 ? (
                  <Empty title="No experiments" icon={<FlaskConical className="h-6 w-6" />}>Create one and attach it to a version.</Empty>
                ) : (
                  <div className="overflow-hidden rounded-2xl border border-border bg-surface">
                    <table className="w-full text-sm">
                      <thead className="border-b border-border text-left text-xs text-faint">
                        <tr>
                          <th className="px-4 py-2.5 font-medium">Experiment</th>
                          <th className="px-3 py-2.5 font-medium">POC / version</th>
                          <th className="px-3 py-2.5 font-medium">Status</th>
                          <th className="px-3 py-2.5 font-medium">Latest result</th>
                          <th className="px-3 py-2.5 font-medium">Owner</th>
                          <th className="px-3 py-2.5 font-medium">Date</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {items.map((i) => {
                          const versions = i.related.filter((r) => r.type === "VERSION");
                          return (
                            <tr key={i.node.id} onClick={() => setSelected(i.node.id)} className={cn("cursor-pointer transition-colors hover:bg-surface-2/60", current?.node.id === i.node.id && "bg-surface-2")}>
                              <td className="px-4 py-3">
                                <div className="font-medium text-text">{i.node.title}</div>
                                <div className="max-w-[280px] truncate text-xs text-muted">{(i.node.metadata.objective as string) ?? i.node.description}</div>
                              </td>
                              <td className="px-3 text-xs text-muted">{versions.map((v) => v.title).join(", ") || "—"}</td>
                              <td className="px-3"><StatusBadge status={i.node.status} /></td>
                              <td className="max-w-[260px] truncate px-3 text-xs text-muted">{(i.node.metadata.results as string) ?? "—"}</td>
                              <td className="px-3 text-xs text-muted">{i.node.owner ?? "—"}</td>
                              <td className="whitespace-nowrap px-3 text-xs text-faint">{fmtDate(i.node.updated_at)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
              {current && <ExperimentDetail item={current} onOpen={openInGraph} onEdit={() => setDialog("edit")} />}
            </div>
          </>
        )}
      </div>
      <NodeFormDialog open={dialog === "create"} onClose={() => setDialog(null)} mode="create" defaultType="EXPERIMENT" allowedTypes={["EXPERIMENT"]} onCreated={(n) => setSelected(n.id)} />
      <NodeFormDialog open={dialog === "edit"} onClose={() => setDialog(null)} mode="edit" node={current?.node} />
    </PageBody>
  );
}

const FIELDS: [string, string][] = [
  ["objective", "Objective"],
  ["hypothesis", "Hypothesis"],
  ["model", "Model / approach"],
  ["dataset", "Dataset"],
  ["configuration", "Configuration"],
  ["results", "Results"],
  ["observations", "Observations"],
  ["conclusion", "Conclusion"],
];

function ExperimentDetail({ item, onOpen, onEdit }: { item: KnowledgeItem; onOpen: (id: string) => void; onEdit: () => void }) {
  const n = item.node;
  const m = n.metadata ?? {};
  const metrics = metricsOf(item);
  const params = m.parameters as Record<string, unknown> | undefined;
  return (
    <Card className="h-fit p-5 xl:sticky xl:top-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[10.5px] uppercase tracking-[0.12em] text-faint">Experiment</div>
          <h2 className="text-base font-semibold text-text">{n.title}</h2>
          <div className="mt-1.5"><StatusBadge status={n.status} /></div>
        </div>
        <div className="flex gap-1">
          <Button size="icon" variant="ghost" onClick={onEdit} title="Edit"><Pencil className="h-4 w-4" /></Button>
          <Button size="icon" variant="ghost" onClick={() => onOpen(n.id)} title="Show in graph"><Network className="h-4 w-4" /></Button>
        </div>
      </div>
      {n.description && <p className="mt-3 text-[13px] leading-5 text-muted">{n.description}</p>}
      {Object.keys(metrics).length > 0 && (
        <div className="mt-4 grid grid-cols-2 gap-2">
          {Object.entries(metrics).map(([k, v]) => (
            <div key={k} className="rounded-lg border border-border bg-bg-elev/60 px-3 py-2">
              <div className="truncate text-[10.5px] text-faint" title={k}>{k}</div>
              <div className="text-base font-semibold tabular-nums text-text">{String(v)}</div>
            </div>
          ))}
        </div>
      )}
      <div className="mt-4 space-y-3">
        {FIELDS.filter(([k]) => typeof m[k] === "string" && (m[k] as string).trim()).map(([k, label]) => (
          <div key={k}>
            <div className="text-[11px] text-faint">{label}</div>
            <div className="text-[13px] leading-5 text-text">{m[k] as string}</div>
          </div>
        ))}
        {params && (
          <div>
            <div className="mb-1 text-[11px] text-faint">Parameters</div>
            <pre className="overflow-x-auto rounded-lg border border-border bg-bg-elev px-2.5 py-2 font-mono text-[11px] text-muted">{JSON.stringify(params, null, 2)}</pre>
          </div>
        )}
      </div>
      {item.related.length > 0 && (
        <div className="mt-4">
          <SectionTitle>Related</SectionTitle>
          <div className="flex flex-wrap gap-1.5">
            {item.related.map((r) => {
              const Icon = NODE_TYPES[r.type].icon;
              return (
                <button key={r.id + r.relationship} onClick={() => onOpen(r.id)} className="flex items-center gap-1.5 rounded-lg border border-border bg-bg-elev/60 px-2 py-1 text-xs text-text hover:border-border-strong">
                  <Icon className="h-3 w-3" style={{ color: NODE_TYPES[r.type].hue }} />
                  {r.title}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </Card>
  );
}
