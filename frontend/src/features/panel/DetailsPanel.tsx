"use client";

import {
  Archive,
  ArchiveRestore,
  ChevronsDownUp,
  ChevronsUpDown,
  ExternalLink,
  FileDown,
  GitBranchPlus,
  Link2,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityTimeline } from "@/components/activity-timeline";
import { DualProgressRing, OutcomeBadge, ProgressSummary, RingLegend, StatusBadge } from "@/components/progress";
import { Badge, Button, cn, Empty, Input, Select, SectionTitle, Spinner } from "@/components/ui/primitives";
import { api } from "@/lib/api";
import { CREATABLE_CHILD_TYPES, fmtDate, fmtPct, NODE_TYPES, OUTCOMES, RELATIONSHIPS } from "@/lib/meta";
import { useApiMutation, useGraph, useNodeDetail, useVersionProgress } from "@/lib/queries";
import type { GraphNode, NodeDetail, Relation, ResearchOutcome } from "@/lib/types";
import { CreateVersionDialog } from "../dialogs/CreateVersionDialog";
import { DeleteNodeDialog } from "../dialogs/DeleteNodeDialog";
import { META_FIELDS, NodeFormDialog } from "../dialogs/NodeFormDialog";
import { RelationshipDialog } from "../dialogs/RelationshipDialog";
import { descendants, indexGraph, pathToRoot } from "../graph/model";
import { useGraphUI } from "../graph/store";
import { DeliverableList } from "./DeliverableList";
import { VersionsSection } from "./VersionsSection";

type Tab = "overview" | "deliverables" | "connections" | "versions" | "activity";

export function DetailsPanel() {
  const { selectedId, panelOpen, closePanel, select, expand, collapse, expanded, setFocus } = useGraphUI();
  const { data: graph } = useGraph();
  const { data, isLoading, error } = useNodeDetail(panelOpen ? selectedId : null);
  const [tab, setTab] = useState<Tab>("overview");
  const lastType = useRef<string | null>(null);

  // Keep the tab when moving between nodes of the same kind; otherwise reset.
  useEffect(() => {
    if (data?.node && data.node.type !== lastType.current) {
      lastType.current = data.node.type;
      setTab("overview");
    }
  }, [data?.node]);

  const idx = useMemo(() => (graph ? indexGraph(graph) : null), [graph]);

  const goTo = (id: string) => {
    if (!graph || !idx) return;
    expand(pathToRoot(id, graph.root_id, idx));
    select(id, true);
    setFocus(id);
  };

  return (
    <AnimatePresence>
      {panelOpen && selectedId && (
        <motion.aside
          key="panel"
          initial={{ x: 40, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 40, opacity: 0 }}
          transition={{ type: "spring", stiffness: 380, damping: 36 }}
          className="absolute right-3 top-3 bottom-3 z-30 flex w-[min(460px,calc(100%-24px))] flex-col overflow-hidden rounded-2xl border border-border-strong bg-surface/95 shadow-2xl shadow-black/60 backdrop-blur-xl"
          aria-label="Node details"
        >
          {isLoading || !data ? (
            <div className="flex flex-1 items-center justify-center">
              {error ? <div className="p-6 text-sm text-danger">{(error as Error).message}</div> : <Spinner />}
            </div>
          ) : (
            <PanelBody
              detail={data}
              tab={tab}
              setTab={setTab}
              onClose={closePanel}
              onGoTo={goTo}
              isExpanded={expanded.includes(data.node.id)}
              hasChildren={!!idx && (idx.children.get(data.node.id) ?? []).length > 0 && data.node.type !== "TEAM"}
              onToggleExpand={() => {
                if (!idx) return;
                if (expanded.includes(data.node.id)) {
                  collapse(data.node.id);
                } else expand([data.node.id]);
              }}
              onExpandAll={() => idx && expand([data.node.id, ...descendants(data.node.id, idx)])}
            />
          )}
        </motion.aside>
      )}
    </AnimatePresence>
  );
}

function PanelBody({
  detail,
  tab,
  setTab,
  onClose,
  onGoTo,
  isExpanded,
  hasChildren,
  onToggleExpand,
  onExpandAll,
}: {
  detail: NodeDetail;
  tab: Tab;
  setTab: (t: Tab) => void;
  onClose: () => void;
  onGoTo: (id: string) => void;
  isExpanded: boolean;
  hasChildren: boolean;
  onToggleExpand: () => void;
  onExpandAll: () => void;
}) {
  const n = detail.node;
  const t = NODE_TYPES[n.type];
  const Icon = t.icon;
  const isPoc = n.type === "POC";
  const isVersion = n.type === "VERSION";
  const tracked = isPoc || isVersion;
  const versionId = isVersion ? n.id : isPoc ? n.poc?.active_version_id ?? null : null;
  const pocId = isPoc ? n.id : isVersion ? n.version?.initiative_id ?? null : null;
  const previousVersionId = isVersion
    ? detail.relations.find((r) => r.direction === "out" && r.edge.relationship === "DERIVED_FROM" && r.node.type === "VERSION")?.node.id
    : undefined;

  const [dialog, setDialog] = useState<null | "edit" | "child" | "relation" | "version" | "delete">(null);
  const [menu, setMenu] = useState(false);
  const { data: graph } = useGraph();
  const pocNode = pocId ? graph?.nodes.find((x) => x.id === pocId) ?? null : null;
  const select = useGraphUI((s) => s.select);
  const expand = useGraphUI((s) => s.expand);
  const setFocus = useGraphUI((s) => s.setFocus);

  const archive = useApiMutation((archived: boolean) => api.patchNode(n.id, { archived }), {
    success: (_, a) => (a ? `${n.title} archived` : `${n.title} restored`),
  });

  const tabs: { id: Tab; label: string; show: boolean; count?: number }[] = [
    { id: "overview", label: "Overview", show: true },
    { id: "deliverables", label: "Deliverables", show: tracked && !!versionId },
    { id: "connections", label: "Connections", show: true, count: detail.relations.length },
    { id: "versions", label: "Versions", show: tracked, count: pocNode?.poc?.version_count },
    { id: "activity", label: "Activity", show: true },
  ];

  return (
    <>
      {/* Header */}
      <div className="border-b border-border px-4 pb-0 pt-4">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={{ background: `color-mix(in srgb, ${t.hue} 14%, transparent)`, color: t.hue }}>
            <Icon className="h-[18px] w-[18px]" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-faint">
              {t.label}
              {isVersion && n.version && ` · ${n.version.is_active ? "Active" : "Historical"}`}
            </div>
            <h2 className="text-[17px] font-semibold leading-6 text-text">{n.title}</h2>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <StatusBadge status={n.status} />
              {n.poc && <OutcomeBadge outcome={n.poc.research_outcome} />}
              {n.archived_at && <Badge color="var(--text-faint)">Archived</Badge>}
              {n.blocked_count > 0 && <Badge color="var(--danger)">{n.blocked_count} blocked</Badge>}
            </div>
          </div>
          <div className="flex items-center gap-0.5">
            {hasChildren && (
              <Button size="icon" variant="ghost" onClick={onToggleExpand} title={isExpanded ? "Collapse branch" : "Expand branch"}>
                {isExpanded ? <ChevronsDownUp className="h-4 w-4" /> : <ChevronsUpDown className="h-4 w-4" />}
              </Button>
            )}
            {n.type !== "TEAM" && (
              <Button size="icon" variant="ghost" onClick={() => setDialog("edit")} title="Edit">
                <Pencil className="h-4 w-4" />
              </Button>
            )}
            <div className="relative">
              <Button size="icon" variant="ghost" onClick={() => setMenu((m) => !m)} title="More actions" aria-label="More actions">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
              {menu && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setMenu(false)} />
                  <div className="absolute right-0 top-9 z-20 w-52 overflow-hidden rounded-xl border border-border-strong bg-surface-2 py-1 shadow-xl shadow-black/50" onClick={() => setMenu(false)}>
                    {n.type !== "TEAM" && <MenuItem icon={Plus} label="Add child node" onClick={() => setDialog("child")} />}
                    <MenuItem icon={Link2} label="Add relationship" onClick={() => setDialog("relation")} />
                    {tracked && <MenuItem icon={GitBranchPlus} label="Create new version" onClick={() => setDialog("version")} />}
                    {hasChildren && <MenuItem icon={ChevronsUpDown} label="Expand entire branch" onClick={onExpandAll} />}
                    {n.type !== "TEAM" && n.type !== "VERSION" && (
                      <MenuItem
                        icon={n.archived_at ? ArchiveRestore : Archive}
                        label={n.archived_at ? "Restore" : "Archive"}
                        onClick={() => archive.mutate(!n.archived_at)}
                      />
                    )}
                    {n.type !== "TEAM" && <MenuItem icon={Trash2} label="Delete…" danger onClick={() => setDialog("delete")} />}
                  </div>
                </>
              )}
            </div>
            <Button size="icon" variant="ghost" onClick={onClose} title="Close (Esc)" aria-label="Close panel">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <nav className="-mb-px mt-3 flex gap-4 overflow-x-auto" role="tablist">
          {tabs.filter((x) => x.show).map((x) => (
            <button
              key={x.id}
              role="tab"
              aria-selected={tab === x.id}
              onClick={() => setTab(x.id)}
              className={cn(
                "whitespace-nowrap border-b-2 pb-2 text-xs font-medium transition-colors",
                tab === x.id ? "border-accent text-text" : "border-transparent text-muted hover:text-text",
              )}
            >
              {x.label}
              {x.count !== undefined && x.count > 0 && <span className="ml-1 text-faint">{x.count}</span>}
            </button>
          ))}
        </nav>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {tab === "overview" && <OverviewTab detail={detail} versionId={versionId} onGoTo={onGoTo} onOpenDeliverables={() => setTab("deliverables")} />}
        {tab === "deliverables" && versionId && (
          <>
            {isPoc && (
              <div className="mb-3 text-xs text-muted">
                Showing deliverables of the active version{" "}
                <button className="font-medium text-accent hover:underline" onClick={() => onGoTo(versionId)}>
                  {n.poc?.active_version_label}
                </button>
                .
              </div>
            )}
            <DeliverableList versionId={versionId} previousVersionId={isVersion ? previousVersionId : undefined} />
          </>
        )}
        {tab === "connections" && <ConnectionsTab relations={detail.relations} onGoTo={onGoTo} onAdd={() => setDialog("relation")} />}
        {tab === "versions" && pocId && (
          <VersionsSection pocId={pocId} currentId={isVersion ? n.id : undefined} onSelect={onGoTo} onCreate={() => setDialog("version")} />
        )}
        {tab === "activity" &&
          (detail.activity.length ? <ActivityTimeline items={detail.activity} dense /> : <Empty title="No activity yet" />)}
      </div>

      <NodeFormDialog open={dialog === "edit"} onClose={() => setDialog(null)} mode="edit" node={n} />
      <NodeFormDialog
        open={dialog === "child"}
        onClose={() => setDialog(null)}
        mode="create"
        defaultType={n.type === "EXPERIMENT" ? "FINDING" : "RESEARCH"}
        defaultParentId={isPoc ? n.poc?.active_version_id : n.id}
        allowedTypes={CREATABLE_CHILD_TYPES}
        onCreated={(c) => {
          expand([isPoc && n.poc?.active_version_id ? n.poc.active_version_id : n.id, n.id]);
          select(c.id, true);
          setFocus(c.id);
        }}
      />
      <RelationshipDialog open={dialog === "relation"} onClose={() => setDialog(null)} sourceId={n.id} targetId={null} />
      <CreateVersionDialog
        open={dialog === "version"}
        onClose={() => setDialog(null)}
        poc={pocNode}
        onCreated={(vid) => {
          if (pocId) expand([pocId]);
          select(vid, true);
          setFocus(vid);
        }}
      />
      <DeleteNodeDialog node={dialog === "delete" ? n : null} onClose={() => setDialog(null)} onDeleted={onClose} />
    </>
  );
}

function MenuItem({ icon: Icon, label, onClick, danger }: { icon: typeof Plus; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button onClick={onClick} className={cn("flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] hover:bg-surface-3", danger ? "text-danger" : "text-text")}>
      <Icon className="h-3.5 w-3.5" /> {label}
    </button>
  );
}

// ------------------------------------------------------------------------------------------------

function OverviewTab({
  detail,
  versionId,
  onGoTo,
  onOpenDeliverables,
}: {
  detail: NodeDetail;
  versionId: string | null;
  onGoTo: (id: string) => void;
  onOpenDeliverables: () => void;
}) {
  const n = detail.node;
  const tracked = n.type === "POC" || n.type === "VERSION" || n.type === "TEAM";
  return (
    <div className="space-y-6">
      {n.description && <p className="text-[13px] leading-5 text-muted">{n.description}</p>}

      {tracked && <ProgressBlock node={n} versionId={versionId} onOpenDeliverables={onOpenDeliverables} />}
      {n.type === "TEAM" && <TeamBreakdown onGoTo={onGoTo} />}
      {n.type === "POC" && n.poc && <PocSettings node={n} />}

      <MetaFields node={n} />

      {n.resource && (n.resource.uri || n.resource.file_reference) && (
        <section>
          <SectionTitle>Resource</SectionTitle>
          <div className="space-y-1.5">
            {n.resource.uri && (
              <a href={n.resource.uri} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-lg border border-border bg-bg-elev/60 px-3 py-2 text-xs text-text hover:border-accent/50">
                <ExternalLink className="h-3.5 w-3.5 text-faint" />
                <span className="truncate">{n.resource.uri}</span>
              </a>
            )}
            {n.resource.file_reference && (
              <a href={`/api/files/${n.resource.file_reference}`} className="flex items-center gap-2 rounded-lg border border-border bg-bg-elev/60 px-3 py-2 text-xs text-text hover:border-accent/50">
                <FileDown className="h-3.5 w-3.5 text-faint" />
                <span className="truncate">{n.resource.file_reference.split("_").slice(1).join("_")}</span>
              </a>
            )}
          </div>
        </section>
      )}

      <section>
        <SectionTitle>Details</SectionTitle>
        <dl className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-1.5 text-xs">
          <dt className="text-faint">Owner</dt>
          <dd className="text-text">{n.owner ?? "—"}</dd>
          {n.version && (
            <>
              <dt className="text-faint">Version</dt>
              <dd className="text-text">{n.version.version_label}</dd>
            </>
          )}
          {n.poc && (
            <>
              <dt className="text-faint">Current version</dt>
              <dd>
                {n.poc.active_version_id ? (
                  <button className="text-accent hover:underline" onClick={() => onGoTo(n.poc!.active_version_id!)}>
                    {n.poc.active_version_label}
                  </button>
                ) : (
                  "—"
                )}
                <span className="text-faint"> of {n.poc.version_count}</span>
              </dd>
            </>
          )}
          <dt className="text-faint">Created</dt>
          <dd className="text-text">{fmtDate(n.created_at)}</dd>
          <dt className="text-faint">Updated</dt>
          <dd className="text-text">{fmtDate(n.updated_at)}</dd>
          {n.tags.length > 0 && (
            <>
              <dt className="text-faint">Tags</dt>
              <dd className="flex flex-wrap gap-1">
                {n.tags.map((t) => (
                  <span key={t} className="rounded bg-surface-3 px-1.5 py-0.5 text-[10.5px] text-muted">{t}</span>
                ))}
              </dd>
            </>
          )}
        </dl>
      </section>

      <ConnectedResources relations={detail.relations} onGoTo={onGoTo} />

      {detail.activity.length > 0 && (
        <section>
          <SectionTitle>Recent activity</SectionTitle>
          <ActivityTimeline items={detail.activity.slice(0, 4)} dense />
        </section>
      )}
    </div>
  );
}

function ProgressBlock({ node, versionId, onOpenDeliverables }: { node: GraphNode; versionId: string | null; onOpenDeliverables: () => void }) {
  const { data: vp } = useVersionProgress(node.type === "TEAM" ? null : versionId);
  const p = node.progress;
  return (
    <section>
      <SectionTitle action={<RingLegend />}>Progress</SectionTitle>
      <div className="flex items-center gap-5 rounded-xl border border-border bg-bg-elev/60 p-4">
        <DualProgressRing progress={p} size={104} stroke={8} gap={4}>
          <div className="text-center">
            <div className="text-xl font-semibold tabular-nums text-text">{fmtPct(p?.overall_progress)}</div>
            <div className="text-[9.5px] uppercase tracking-[0.12em] text-faint">overall</div>
          </div>
        </DualProgressRing>
        <div className="min-w-0 flex-1 space-y-3">
          <ProgressSummary progress={p} />
          <div className="text-[10.5px] text-faint">
            {node.type === "TEAM" ? "Importance-weighted across active initiatives (latest active versions only)." : "Overall = 50% code + 50% validation."}
          </div>
        </div>
      </div>
      {vp && (
        <div className="mt-3 grid grid-cols-2 gap-3">
          {(["code", "validation"] as const).map((cat) => {
            const items = cat === "code" ? vp.code_breakdown : vp.validation_breakdown;
            const color = cat === "code" ? "var(--code)" : "var(--validation)";
            return (
              <button key={cat} onClick={onOpenDeliverables} className="rounded-xl border border-border bg-bg-elev/40 p-2.5 text-left hover:border-border-strong">
                <div className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-wider" style={{ color }}>
                  {cat === "code" ? "Code" : "Validation"} breakdown
                </div>
                <div className="space-y-1.5">
                  {items.map((li) => (
                    <div key={li.deliverable_id} title={`${li.title}: contributes ${li.contribution.toFixed(2)} of ${li.normalized_weight.toFixed(1)} possible points`}>
                      <div className="flex items-baseline justify-between gap-1 text-[10px]">
                        <span className="truncate text-muted">{li.title}</span>
                        <span className="shrink-0 tabular-nums text-faint">{li.contribution.toFixed(1)}/{li.normalized_weight.toFixed(0)}</span>
                      </div>
                      <div className="relative mt-0.5 h-1 overflow-hidden rounded-full bg-surface-3">
                        <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${li.score * 100}%`, background: color }} />
                      </div>
                    </div>
                  ))}
                </div>
              </button>
            );
          })}
        </div>
      )}
      {vp && vp.blockers.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {vp.blockers.map((b) => (
            <div key={b.deliverable_id} className="rounded-lg border border-danger/25 bg-danger/5 px-3 py-2 text-xs">
              <span className="font-medium text-danger">Blocked · {b.title}</span>
              <div className="mt-0.5 text-muted">{b.reason}</div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function TeamBreakdown({ onGoTo }: { onGoTo: (id: string) => void }) {
  const { data: graph } = useGraph();
  const t = graph?.team_progress;
  if (!t) return null;
  const totalW = t.contributions.reduce((a, c) => a + c.importance, 0);
  return (
    <section>
      <SectionTitle>Contributing initiatives</SectionTitle>
      <div className="space-y-1.5">
        {t.contributions.map((c) => (
          <button key={c.initiative_id} onClick={() => onGoTo(c.initiative_id)} className="flex w-full items-center gap-3 rounded-xl border border-border bg-bg-elev/50 px-3 py-2 text-left hover:border-border-strong">
            <DualProgressRing progress={c} size={34} stroke={3.5} gap={1.5} />
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-medium text-text">
                {c.initiative_title} <span className="text-xs text-faint">{c.version_label}</span>
              </div>
              <div className="text-[10.5px] tabular-nums text-faint">
                <span className="text-code">{fmtPct(c.code_progress)}</span> · <span className="text-validation">{fmtPct(c.validation_progress)}</span>
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs font-semibold tabular-nums text-text">{fmtPct(c.overall_progress)}</div>
              <div className="text-[10px] text-faint">weight {c.importance} ({((c.importance / totalW) * 100).toFixed(0)}%)</div>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}

function PocSettings({ node }: { node: GraphNode }) {
  const poc = node.poc!;
  // Unsaved edit of the weight; null means "show the server value".
  const [draft, setDraft] = useState<string | null>(null);
  const w = draft ?? String(poc.importance_weight);
  const setW = setDraft;
  const m = useApiMutation((body: Parameters<typeof api.patchPoc>[1]) => api.patchPoc(node.id, body), {
    success: "Initiative updated",
    onSuccess: () => setDraft(null),
  });
  return (
    <section>
      <SectionTitle>Initiative</SectionTitle>
      <div className="grid grid-cols-2 gap-3">
        <label className="space-y-1">
          <span className="text-[11px] text-faint">Research outcome</span>
          <Select value={poc.research_outcome} onChange={(e) => m.mutate({ research_outcome: e.target.value as ResearchOutcome })}>
            {Object.entries(OUTCOMES).map(([k, o]) => (
              <option key={k} value={k}>{o.label}</option>
            ))}
          </Select>
        </label>
        <label className="space-y-1">
          <span className="text-[11px] text-faint">Importance weight</span>
          <div className="flex gap-1.5">
            <Input type="number" min={0.5} step={0.5} value={w} onChange={(e) => setW(e.target.value)} />
            {Number(w) !== poc.importance_weight && (
              <Button size="md" variant="primary" disabled={!(Number(w) > 0)} loading={m.isPending} onClick={() => m.mutate({ importance_weight: Number(w) })}>
                Save
              </Button>
            )}
          </div>
        </label>
      </div>
      <p className="mt-2 text-[10.5px] text-faint">
        Outcome is independent of progress. A fully researched POC can be validly <em>Rejected</em>.
      </p>
    </section>
  );
}

function MetaFields({ node }: { node: GraphNode }) {
  const fields = META_FIELDS[node.type] ?? [];
  const m = node.metadata ?? {};
  const metrics = m.metrics as Record<string, number | string> | undefined;
  const params = m.parameters as Record<string, unknown> | undefined;
  const urls = m.external_urls as string[] | undefined;
  const present = fields.filter((f) => typeof m[f.key] === "string" && (m[f.key] as string).trim());
  if (!present.length && !metrics && !params && !urls?.length && !m.confidence) return null;
  return (
    <section>
      <SectionTitle>{node.type === "EXPERIMENT" ? "Experiment" : node.type === "FINDING" ? "Finding" : "Research"}</SectionTitle>
      <div className="space-y-3">
        {node.type === "FINDING" && typeof m.confidence === "string" && (
          <Badge color={m.confidence === "CONFIRMED" ? "var(--ok)" : "var(--warn)"}>{m.confidence === "CONFIRMED" ? "Confirmed" : "Tentative"}</Badge>
        )}
        {present.map((f) => (
          <div key={f.key}>
            <div className="text-[11px] text-faint">{f.label}</div>
            <div className="text-[13px] leading-5 text-text">{m[f.key] as string}</div>
          </div>
        ))}
        {params && (
          <div>
            <div className="mb-1 text-[11px] text-faint">Parameters</div>
            <pre className="overflow-x-auto rounded-lg border border-border bg-bg-elev px-2.5 py-2 font-mono text-[11px] text-muted">{JSON.stringify(params, null, 2)}</pre>
          </div>
        )}
        {metrics && (
          <div>
            <div className="mb-1 text-[11px] text-faint">Metrics</div>
            <div className="grid grid-cols-2 gap-1.5">
              {Object.entries(metrics).map(([k, v]) => (
                <div key={k} className="rounded-lg border border-border bg-bg-elev/60 px-2.5 py-1.5">
                  <div className="truncate text-[10.5px] text-faint" title={k}>{k}</div>
                  <div className="text-sm font-semibold tabular-nums text-text">{String(v)}</div>
                </div>
              ))}
            </div>
          </div>
        )}
        {urls && urls.length > 0 && (
          <div>
            <div className="mb-1 text-[11px] text-faint">External references</div>
            {urls.map((u) => (
              <a key={u} href={u} target="_blank" rel="noreferrer" className="block truncate text-xs text-accent hover:underline">{u}</a>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

const GROUPS: { label: string; types: string[] }[] = [
  { label: "Versions", types: ["VERSION"] },
  { label: "Research", types: ["RESEARCH"] },
  { label: "Experiments", types: ["EXPERIMENT"] },
  { label: "Findings", types: ["FINDING"] },
  { label: "Papers & documents", types: ["PAPER", "DOCUMENTATION"] },
  { label: "Code & demos", types: ["CODE", "DEMO"] },
  { label: "Initiatives", types: ["POC", "TEAM", "INITIATIVE"] },
];

function ConnectedResources({ relations, onGoTo }: { relations: Relation[]; onGoTo: (id: string) => void }) {
  const children = relations.filter((r) => r.direction === "out" && r.edge.relationship !== "DERIVED_FROM");
  if (!children.length) return null;
  return (
    <section>
      <SectionTitle>Connected resources</SectionTitle>
      <div className="space-y-3">
        {GROUPS.map((g) => {
          const items = children.filter((r) => g.types.includes(r.node.type));
          if (!items.length) return null;
          return (
            <div key={g.label}>
              <div className="mb-1 text-[11px] text-faint">
                {g.label} <span className="text-faint/70">{items.length}</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {items.map((r) => (
                  <NodeChip key={r.edge.id} node={r.node} shared={r.edge.relationship === "SHARES_RESOURCE"} onClick={() => onGoTo(r.node.id)} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function NodeChip({ node, onClick, shared }: { node: GraphNode; onClick: () => void; shared?: boolean }) {
  const t = NODE_TYPES[node.type];
  const Icon = t.icon;
  return (
    <button onClick={onClick} className="flex max-w-full items-center gap-1.5 rounded-lg border border-border bg-bg-elev/60 px-2 py-1 text-xs text-text hover:border-border-strong" title={shared ? "Shared resource (linked, not duplicated)" : undefined}>
      <Icon className="h-3 w-3 shrink-0" style={{ color: t.hue }} />
      <span className="truncate">{node.title}</span>
      {shared && <Link2 className="h-3 w-3 shrink-0 text-[#2f8f86]" />}
    </button>
  );
}

function ConnectionsTab({ relations, onGoTo, onAdd }: { relations: Relation[]; onGoTo: (id: string) => void; onAdd: () => void }) {
  const [toDelete, setToDelete] = useState<Relation | null>(null);
  const del = useApiMutation((id: string) => api.deleteEdge(id), { success: "Relationship removed", onSuccess: () => setToDelete(null) });
  const locked = (r: Relation) => ["HAS_VERSION", "VERSION_OF", "OWNS"].includes(r.edge.relationship);
  return (
    <div className="space-y-2">
      {relations.length === 0 && <Empty title="No relationships" />}
      {relations.map((r) => {
        const t = NODE_TYPES[r.node.type];
        const Icon = t.icon;
        return (
          <div key={r.edge.id} className="group flex items-center gap-2.5 rounded-xl border border-border bg-bg-elev/50 px-3 py-2">
            <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: t.hue }} />
            <button className="min-w-0 flex-1 text-left" onClick={() => onGoTo(r.node.id)}>
              <div className="truncate text-[13px] text-text">{r.node.title}</div>
              <div className="text-[10.5px] text-faint">
                {r.direction === "out" ? "this" : t.label.toLowerCase()} —{RELATIONSHIPS[r.edge.relationship].label.toLowerCase()}→{" "}
                {r.direction === "out" ? t.label.toLowerCase() : "this"}
              </div>
            </button>
            {!locked(r) && (
              <button className="opacity-0 transition-opacity group-hover:opacity-100" onClick={() => setToDelete(r)} aria-label="Remove relationship">
                <Trash2 className="h-3.5 w-3.5 text-faint hover:text-danger" />
              </button>
            )}
          </div>
        );
      })}
      <Button size="sm" variant="outline" onClick={onAdd} className="w-full justify-center">
        <Link2 className="h-3.5 w-3.5" /> Add relationship
      </Button>
      {toDelete && (
        <DeleteRelationConfirm relation={toDelete} loading={del.isPending} onCancel={() => setToDelete(null)} onConfirm={() => del.mutate(toDelete.edge.id)} />
      )}
    </div>
  );
}

function DeleteRelationConfirm({ relation, onCancel, onConfirm, loading }: { relation: Relation; onCancel: () => void; onConfirm: () => void; loading: boolean }) {
  return (
    <div className="rounded-xl border border-danger/30 bg-danger/5 p-3 text-xs">
      <div className="text-text">
        Remove the <span className="font-medium">{RELATIONSHIPS[relation.edge.relationship].label.toLowerCase()}</span> link to “{relation.node.title}”?
      </div>
      <div className="mt-2 flex justify-end gap-1.5">
        <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button size="sm" variant="danger" loading={loading} onClick={onConfirm}>Remove</Button>
      </div>
    </div>
  );
}
