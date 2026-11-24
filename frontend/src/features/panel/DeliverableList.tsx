"use client";

import {
  AlertTriangle,
  Ban,
  Check,
  ChevronDown,
  ExternalLink,
  Lock,
  Paperclip,
  Plus,
  Recycle,
  Scissors,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { useMemo, useState } from "react";
import { ProgressBar } from "@/components/progress";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Badge, Button, cn, Field, Input, Select, Spinner, Textarea } from "@/components/ui/primitives";
import { api } from "@/lib/api";
import { EVIDENCE_TYPES, fmtPct, NODE_TYPES, STATES, stateLabel, timeAgo } from "@/lib/meta";
import { useApiMutation, useDeliverables, useGraph } from "@/lib/queries";
import type { CompletionState, Deliverable, DeliverableCategory, Evidence, EvidenceType } from "@/lib/types";

const STATE_COLOR: Record<CompletionState, string> = {
  NOT_STARTED: "var(--text-faint)",
  STARTED: "#7d8aa0",
  PARTIAL: "var(--info)",
  IMPLEMENTED: "#a78bfa",
  VERIFIED: "var(--ok)",
};

export function StateChip({ state }: { state: CompletionState }) {
  return <Badge color={STATE_COLOR[state]}>{stateLabel(state)}</Badge>;
}

/** Deliverables of one version, grouped by category. All scoring happens server-side. */
export function DeliverableList({ versionId, previousVersionId }: { versionId: string; previousVersionId?: string | null }) {
  const { data, isLoading, error } = useDeliverables(versionId);
  const prev = useDeliverables(previousVersionId ?? null);

  const reuseByKey = useMemo(() => {
    const m = new Map<string, Evidence[]>();
    for (const d of prev.data?.deliverables ?? []) if (d.evidence.length) m.set(d.key, d.evidence);
    return m;
  }, [prev.data]);

  if (isLoading) return <div className="flex justify-center py-8"><Spinner /></div>;
  if (error || !data) return <div className="text-xs text-danger">{(error as Error)?.message ?? "Failed to load"}</div>;

  const readOnly = !data.is_active;
  const groups: { cat: DeliverableCategory; label: string; color: string; value: number | null }[] = [
    { cat: "CODE", label: "Code deliverables", color: "var(--code)", value: data.progress.code_progress },
    { cat: "VALIDATION", label: "Validation deliverables", color: "var(--validation)", value: data.progress.validation_progress },
  ];

  return (
    <div className="space-y-5">
      {readOnly && (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-bg-elev px-3 py-2 text-xs text-muted">
          <Lock className="h-3.5 w-3.5" /> Historical version: its deliverables and evidence are read-only.
        </div>
      )}
      {groups.map((g) => {
        const items = data.deliverables.filter((d) => d.category === g.cat);
        const applicable = items.filter((d) => !d.is_not_applicable).reduce((a, d) => a + d.weight, 0);
        return (
          <section key={g.cat}>
            <div className="mb-2 flex items-center gap-2">
              <span className="h-2 w-2 rounded-full" style={{ background: g.color }} />
              <h4 className="text-xs font-semibold text-text">{g.label}</h4>
              <span className="ml-auto text-xs font-semibold tabular-nums" style={{ color: g.color }}>
                {fmtPct(g.value, 2)}
              </span>
            </div>
            <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-bg-elev/50">
              {items.map((d) => (
                <DeliverableRow
                  key={d.id}
                  d={d}
                  applicableWeight={applicable}
                  color={g.color}
                  readOnly={readOnly}
                  reuse={readOnly ? [] : (reuseByKey.get(d.key) ?? []).filter((e) => !d.evidence.some((x) => x.reused_from_evidence_id === e.id))}
                />
              ))}
            </div>
          </section>
        );
      })}
      <p className="text-[11px] leading-4 text-faint">
        Progress = Σ(weight × score) ÷ Σ(applicable weights). Scores: Not started 0 · Started 0.25 · Partial 0.5 ·
        Implemented 0.75 · Verified 1.0. Verified requires evidence. N/A is allowed only before work begins.
      </p>
    </div>
  );
}

function DeliverableRow({
  d,
  applicableWeight,
  color,
  readOnly,
  reuse,
}: {
  d: Deliverable;
  applicableWeight: number;
  color: string;
  readOnly: boolean;
  reuse: Evidence[];
}) {
  const [open, setOpen] = useState(false);
  const [panel, setPanel] = useState<null | "block" | "na" | "evidence" | "exception">(null);
  const [reason, setReason] = useState("");
  const share = d.is_not_applicable || !applicableWeight ? 0 : (d.weight / applicableWeight) * 100;

  const patch = useApiMutation((body: Parameters<typeof api.patchDeliverable>[1]) => api.patchDeliverable(d.id, body), {
    onSuccess: () => {
      setPanel(null);
      setReason("");
    },
  });
  const canVerify = d.evidence.length > 0 || d.verification_exception;

  const setState = (s: CompletionState) => {
    if (s === d.state || readOnly) return;
    patch.mutate({ state: s });
  };

  return (
    <div className={cn("px-3 py-2.5", d.is_not_applicable && "opacity-60")}>
      <div className="flex items-center gap-2.5">
        <button className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => setOpen((o) => !o)}>
          <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 text-faint transition-transform", !open && "-rotate-90")} />
          <span className={cn("truncate text-[13px] text-text", d.is_not_applicable && "line-through decoration-faint")}>{d.title}</span>
          {d.is_blocked && (
            <span title={d.blocker_reason ?? "Blocked"}>
              <Ban className="h-3.5 w-3.5 shrink-0 text-danger" />
            </span>
          )}
          {d.evidence.length > 0 && (
            <span className="flex items-center gap-0.5 text-[10px] text-faint" title={`${d.evidence.length} evidence`}>
              <Paperclip className="h-3 w-3" />{d.evidence.length}
            </span>
          )}
        </button>
        <span className="text-[10.5px] tabular-nums text-faint" title={`Weight ${d.weight} → ${share.toFixed(1)}% of applicable`}>
          {d.is_not_applicable ? "N/A" : `${d.weight}w`}
        </span>
        {d.is_not_applicable ? (
          <Badge color="var(--text-faint)">Not applicable</Badge>
        ) : (
          <Select
            aria-label={`State of ${d.title}`}
            className="h-7 w-[124px] py-0 text-xs"
            value={d.state}
            disabled={readOnly || patch.isPending}
            onChange={(e) => setState(e.target.value as CompletionState)}
            style={{ color: STATE_COLOR[d.state] }}
          >
            {STATES.map((s) => (
              <option key={s.value} value={s.value} disabled={s.value === "VERIFIED" && !canVerify}>
                {s.label}
                {s.value === "VERIFIED" && !canVerify ? " (needs evidence)" : ""}
              </option>
            ))}
          </Select>
        )}
      </div>
      {!d.is_not_applicable && (
        <div className="mt-2 pl-[22px]">
          <ProgressBar value={d.score * 100} color={color} height={3} />
        </div>
      )}

      {open && (
        <div className="mt-3 space-y-3 pl-[22px]">
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-faint">
            <span>Weight {d.weight} ({share.toFixed(1)}% of applicable)</span>
            <span>Score {d.score.toFixed(2)}</span>
            {d.updated_by && <span>Updated by {d.updated_by} · {timeAgo(d.updated_at)}</span>}
          </div>
          {d.is_blocked && (
            <div className="flex items-start gap-2 rounded-lg border border-danger/25 bg-danger/5 px-2.5 py-2 text-xs text-danger">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                <span className="font-medium">Blocked:</span> {d.blocker_reason}
                <span className="block text-[10.5px] text-muted">Blocked is a status. The score is kept as is.</span>
              </span>
            </div>
          )}
          {d.is_not_applicable && <div className="text-xs text-muted">N/A reason: {d.not_applicable_reason}</div>}
          {d.verification_exception && (
            <div className="flex items-center gap-1.5 text-xs text-warn">
              <ShieldCheck className="h-3.5 w-3.5" /> Verification exception: {d.verification_exception_reason}
            </div>
          )}

          <EvidenceList d={d} readOnly={readOnly} reuse={reuse} />

          {!readOnly && (
            <div className="flex flex-wrap gap-1.5">
              <Button size="sm" variant="outline" onClick={() => setPanel(panel === "evidence" ? null : "evidence")}>
                <Plus className="h-3 w-3" /> Evidence
              </Button>
              {d.is_blocked ? (
                <Button size="sm" variant="outline" loading={patch.isPending} onClick={() => patch.mutate({ is_blocked: false })}>
                  <Check className="h-3 w-3" /> Unblock
                </Button>
              ) : (
                <Button size="sm" variant="outline" onClick={() => setPanel(panel === "block" ? null : "block")}>
                  <Ban className="h-3 w-3" /> Mark blocked
                </Button>
              )}
              {d.is_not_applicable ? (
                <Button size="sm" variant="outline" onClick={() => setPanel("na")}>
                  <Scissors className="h-3 w-3" /> Restore to scope
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={d.ever_started || d.state !== "NOT_STARTED" || d.evidence.length > 0}
                  title={d.ever_started ? "Work has started: N/A can no longer be applied" : "Exclude from scope (weights are re-normalized)"}
                  onClick={() => setPanel(panel === "na" ? null : "na")}
                >
                  <Scissors className="h-3 w-3" /> Mark N/A
                </Button>
              )}
              {!d.verification_exception && d.evidence.length === 0 && (
                <Button size="sm" variant="ghost" onClick={() => setPanel(panel === "exception" ? null : "exception")}>
                  <ShieldCheck className="h-3 w-3" /> Exception
                </Button>
              )}
            </div>
          )}

          {panel === "evidence" && <EvidenceForm deliverableId={d.id} onDone={() => setPanel(null)} />}
          {(panel === "block" || panel === "na" || panel === "exception") && (
            <div className="space-y-2 rounded-lg border border-border bg-surface p-2.5">
              <Field
                label={
                  panel === "block"
                    ? "What is blocking this deliverable?"
                    : panel === "exception"
                      ? "Why can this be verified without evidence?"
                      : d.is_not_applicable
                        ? "Reason for restoring scope"
                        : "Why is this deliverable not applicable?"
                }
                hint={panel === "na" ? "Scope changes are logged with your name and the time." : undefined}
              >
                <Textarea className="min-h-[52px]" value={reason} autoFocus onChange={(e) => setReason(e.target.value)} />
              </Field>
              <div className="flex justify-end gap-1.5">
                <Button size="sm" variant="ghost" onClick={() => setPanel(null)}>Cancel</Button>
                <Button
                  size="sm"
                  variant="primary"
                  disabled={!reason.trim()}
                  loading={patch.isPending}
                  onClick={() =>
                    patch.mutate(
                      panel === "block"
                        ? { is_blocked: true, blocker_reason: reason }
                        : panel === "exception"
                          ? { verification_exception: true, verification_exception_reason: reason }
                          : { is_not_applicable: !d.is_not_applicable, not_applicable_reason: reason },
                    )
                  }
                >
                  Confirm
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function EvidenceList({ d, readOnly, reuse }: { d: Deliverable; readOnly: boolean; reuse: Evidence[] }) {
  const [toDelete, setToDelete] = useState<Evidence | null>(null);
  const del = useApiMutation((id: string) => api.deleteEvidence(id), { success: "Evidence removed", onSuccess: () => setToDelete(null) });
  const accept = useApiMutation((id: string) => api.reuseEvidence(id, d.id), { success: "Evidence accepted for this version" });

  if (!d.evidence.length && !reuse.length) {
    return <div className="text-[11px] text-faint">No evidence attached.</div>;
  }
  return (
    <div className="space-y-1.5">
      {d.evidence.map((e) => (
        <div key={e.id} className="group flex items-start gap-2 rounded-lg border border-border bg-surface px-2.5 py-1.5">
          <Paperclip className="mt-0.5 h-3 w-3 shrink-0 text-validation" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              {e.uri ? (
                <a href={e.uri} target="_blank" rel="noreferrer" className="truncate text-xs text-text hover:text-accent">
                  {e.title}
                </a>
              ) : (
                <span className="truncate text-xs text-text">{e.title}</span>
              )}
              {e.uri && <ExternalLink className="h-3 w-3 shrink-0 text-faint" />}
            </div>
            <div className="text-[10.5px] text-faint">
              {EVIDENCE_TYPES.find((t) => t.value === e.type)?.label} · {e.created_by} · {timeAgo(e.created_at)}
              {e.reused_from_evidence_id && <span className="text-accent"> · reused, accepted by {e.accepted_by}</span>}
            </div>
          </div>
          {!readOnly && (
            <button className="opacity-0 transition-opacity group-hover:opacity-100" onClick={() => setToDelete(e)} aria-label="Remove evidence">
              <Trash2 className="h-3.5 w-3.5 text-faint hover:text-danger" />
            </button>
          )}
        </div>
      ))}
      {reuse.map((e) => (
        <div key={e.id} className="flex items-center gap-2 rounded-lg border border-dashed border-border px-2.5 py-1.5">
          <Recycle className="h-3 w-3 shrink-0 text-faint" />
          <span className="min-w-0 flex-1 truncate text-xs text-muted">
            From previous version: <span className="text-text">{e.title}</span>
          </span>
          <Button size="sm" variant="outline" className="h-6" loading={accept.isPending} onClick={() => accept.mutate(e.id)}>
            Accept
          </Button>
        </div>
      ))}
      <ConfirmDialog
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={() => toDelete && del.mutate(toDelete.id)}
        loading={del.isPending}
        title="Remove evidence?"
        confirmLabel="Remove"
        message={<>“{toDelete?.title}” will be detached from {d.title}. Verified deliverables must keep at least one piece of evidence.</>}
      />
    </div>
  );
}

function EvidenceForm({ deliverableId, onDone }: { deliverableId: string; onDone: () => void }) {
  const { data: graph } = useGraph();
  const [type, setType] = useState<EvidenceType>("BENCHMARK");
  const [title, setTitle] = useState("");
  const [uri, setUri] = useState("");
  const [resourceId, setResourceId] = useState("");
  const [err, setErr] = useState<string>();
  const resources = (graph?.nodes ?? []).filter((n) => ["RESEARCH", "EXPERIMENT", "FINDING", "PAPER", "DOCUMENTATION", "CODE", "DEMO"].includes(n.type));

  const m = useApiMutation(
    () => api.addEvidence(deliverableId, { type, title: title.trim(), uri: uri.trim() || null, resource_node_id: resourceId || null }),
    { success: "Evidence attached", onSuccess: onDone },
  );
  const submit = () => {
    if (!title.trim()) return setErr("Title is required");
    if (!uri.trim() && !resourceId) return setErr("Provide a URL or link an existing resource");
    if (uri && !/^https?:\/\//i.test(uri)) return setErr("URL must start with http(s)://");
    setErr(undefined);
    m.mutate(undefined);
  };
  return (
    <div className="space-y-2.5 rounded-lg border border-border bg-surface p-2.5">
      <div className="grid grid-cols-2 gap-2">
        <Field label="Type">
          <Select value={type} onChange={(e) => setType(e.target.value as EvidenceType)}>
            {EVIDENCE_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </Select>
        </Field>
        <Field label="Link existing resource">
          <Select
            value={resourceId}
            onChange={(e) => {
              setResourceId(e.target.value);
              const r = resources.find((x) => x.id === e.target.value);
              if (r && !title) setTitle(r.title);
            }}
          >
            <option value="">None</option>
            {resources.map((r) => (
              <option key={r.id} value={r.id}>
                {NODE_TYPES[r.type].label}: {r.title}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Title">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Latency benchmark run #14" />
      </Field>
      <Field label="URL">
        <Input value={uri} onChange={(e) => setUri(e.target.value)} placeholder="https://…" />
      </Field>
      {err && <div className="text-xs text-danger">{err}</div>}
      <div className="flex justify-end gap-1.5">
        <Button size="sm" variant="ghost" onClick={onDone}>Cancel</Button>
        <Button size="sm" variant="primary" loading={m.isPending} onClick={submit}>Attach</Button>
      </div>
    </div>
  );
}
