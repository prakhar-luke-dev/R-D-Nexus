"use client";

import { Upload } from "lucide-react";
import { useRef, useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Button, Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { api } from "@/lib/api";
import { CREATABLE_CHILD_TYPES, NODE_TYPES, OUTCOMES, RESOURCE_KINDS, RESOURCE_TYPES, STATUS } from "@/lib/meta";
import { useApiMutation, useGraph } from "@/lib/queries";
import type { GraphNode, NodeStatus, NodeType, ResearchOutcome, ResourceType } from "@/lib/types";
import { NodePicker } from "./NodePicker";

/** Type-specific metadata fields, stored in node.metadata. */
export const META_FIELDS: Partial<Record<NodeType, { key: string; label: string; multiline?: boolean; placeholder?: string }[]>> = {
  RESEARCH: [
    { key: "research_question", label: "Research question", multiline: true },
    { key: "hypothesis", label: "Hypothesis", multiline: true },
  ],
  EXPERIMENT: [
    { key: "objective", label: "Objective", multiline: true },
    { key: "hypothesis", label: "Hypothesis", multiline: true },
    { key: "model", label: "Model / approach" },
    { key: "dataset", label: "Dataset" },
    { key: "configuration", label: "Configuration" },
    { key: "results", label: "Results", multiline: true },
    { key: "observations", label: "Observations", multiline: true },
    { key: "conclusion", label: "Conclusion", multiline: true },
  ],
  FINDING: [{ key: "implications", label: "Technical implications", multiline: true }],
};

const STATUSES: NodeStatus[] = ["PLANNED", "IN_PROGRESS", "BLOCKED", "ON_HOLD", "COMPLETED"];

interface FormState {
  type: NodeType;
  title: string;
  description: string;
  status: NodeStatus;
  owner: string;
  tags: string;
  parentId: string;
  uri: string;
  fileRef: string;
  resourceType: ResourceType | "";
  importance: string;
  outcome: ResearchOutcome;
  meta: Record<string, string>;
  metrics: string;
  confidence: string;
}

const blank = (type: NodeType, parentId = ""): FormState => ({
  type,
  title: "",
  description: "",
  status: "IN_PROGRESS",
  owner: "",
  tags: "",
  parentId,
  uri: "",
  fileRef: "",
  resourceType: "",
  importance: "1",
  outcome: "PENDING",
  meta: {},
  metrics: "",
  confidence: "TENTATIVE",
});

function fromNode(n: GraphNode): FormState {
  const meta: Record<string, string> = {};
  for (const [k, v] of Object.entries(n.metadata ?? {})) if (typeof v === "string") meta[k] = v;
  const metrics = n.metadata?.metrics as Record<string, number> | undefined;
  return {
    ...blank(n.type),
    title: n.title,
    description: n.description,
    status: n.status,
    owner: n.owner ?? "",
    tags: n.tags.join(", "),
    uri: n.resource?.uri ?? "",
    fileRef: n.resource?.file_reference ?? "",
    resourceType: n.resource?.resource_type ?? "",
    meta,
    metrics: metrics ? Object.entries(metrics).map(([k, v]) => `${k}=${v}`).join("\n") : "",
    confidence: (n.metadata?.confidence as string) ?? "TENTATIVE",
  };
}

function parseMetrics(text: string): Record<string, number | string> | undefined {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return undefined;
  const out: Record<string, number | string> = {};
  for (const l of lines) {
    const i = l.indexOf("=");
    if (i <= 0) continue;
    const k = l.slice(0, i).trim();
    const raw = l.slice(i + 1).trim();
    out[k] = raw !== "" && !Number.isNaN(Number(raw)) ? Number(raw) : raw;
  }
  return out;
}

function NodeFormDialogInner({
  open,
  onClose,
  mode,
  node,
  defaultType = "RESEARCH",
  defaultParentId,
  allowedTypes,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  mode: "create" | "edit";
  node?: GraphNode | null;
  defaultType?: NodeType;
  defaultParentId?: string | null;
  allowedTypes?: NodeType[];
  onCreated?: (n: GraphNode) => void;
}) {
  const { data: graph } = useGraph();
  const [f, setF] = useState<FormState>(() =>
    mode === "edit" && node ? fromNode(node) : blank(defaultType, defaultParentId ?? ""),
  );
  const [error, setError] = useState<string>();
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((s) => ({ ...s, [k]: v }));
  const isResource = RESOURCE_TYPES.includes(f.type);
  const isPoc = f.type === "POC";
  const types = allowedTypes ?? ["POC", ...CREATABLE_CHILD_TYPES];

  const buildMeta = () => {
    const base: Record<string, unknown> = mode === "edit" && node ? { ...node.metadata } : {};
    for (const fld of META_FIELDS[f.type] ?? []) {
      const v = f.meta[fld.key]?.trim();
      if (v) base[fld.key] = v;
      else delete base[fld.key];
    }
    if (f.type === "EXPERIMENT") {
      const m = parseMetrics(f.metrics);
      if (m) base.metrics = m;
      else delete base.metrics;
    }
    if (f.type === "FINDING") base.confidence = f.confidence;
    return base;
  };

  const create = useApiMutation(
    () =>
      api.createNode({
        type: f.type,
        title: f.title.trim(),
        description: f.description,
        status: f.status,
        owner: f.owner || null,
        tags: f.tags.split(",").map((t) => t.trim()).filter(Boolean),
        metadata: buildMeta(),
        parent_id: isPoc ? null : f.parentId || null,
        uri: isResource || f.uri ? f.uri || null : null,
        file_reference: f.fileRef || null,
        resource_type: (f.resourceType || null) as ResourceType | null,
        importance_weight: isPoc ? Number(f.importance) : null,
        research_outcome: isPoc ? f.outcome : null,
      }),
    {
      success: (n) => `${NODE_TYPES[n.type].label} “${n.title}” created`,
      onSuccess: (n) => {
        onCreated?.(n);
        onClose();
      },
    },
  );

  const update = useApiMutation(
    () =>
      api.patchNode(node!.id, {
        title: f.title.trim(),
        description: f.description,
        status: node!.type === "VERSION" && node!.version && !node!.version.is_active ? undefined : f.status,
        owner: f.owner || null,
        tags: f.tags.split(",").map((t) => t.trim()).filter(Boolean),
        metadata: buildMeta(),
        ...(isResource || node?.resource ? { uri: f.uri, file_reference: f.fileRef, ...(f.resourceType ? { resource_type: f.resourceType } : {}) } : {}),
      }),
    { success: "Changes saved", onSuccess: onClose },
  );

  const submit = () => {
    if (!f.title.trim()) return setError("Title is required");
    if (isPoc && !(Number(f.importance) > 0)) return setError("Importance must be a positive number");
    if (f.uri && !/^https?:\/\//i.test(f.uri)) return setError("URL must start with http:// or https://");
    setError(undefined);
    (mode === "create" ? create : update).mutate(undefined);
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      const r = await api.upload(file);
      setF((s) => ({ ...s, fileRef: r.file_reference, title: s.title || r.filename }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const parentCandidates = (graph?.nodes ?? []).filter((n) => n.type !== "TEAM" || f.type === "POC");

  return (
    <Dialog
      open={open}
      onClose={onClose}
      width="max-w-xl"
      title={mode === "create" ? "Add node" : `Edit ${node ? NODE_TYPES[node.type].label.toLowerCase() : "node"}`}
      description={mode === "create" ? "New nodes are placed automatically; drag them to fine-tune." : undefined}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={submit} loading={create.isPending || update.isPending}>
            {mode === "create" ? "Create" : "Save"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {mode === "create" && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Type">
              <Select value={f.type} onChange={(e) => set("type", e.target.value as NodeType)}>
                {types.map((t) => (
                  <option key={t} value={t}>{NODE_TYPES[t].label}</option>
                ))}
              </Select>
            </Field>
            {!isPoc && (
              <Field label="Connect under" hint="Optional parent (version, experiment…)">
                <NodePicker nodes={parentCandidates} value={f.parentId} onChange={(v) => set("parentId", v)} placeholder="No parent (unlinked)" />
              </Field>
            )}
          </div>
        )}
        <Field label="Title">
          <Input value={f.title} autoFocus onChange={(e) => set("title", e.target.value)} placeholder="e.g. Streaming ASR comparison" />
        </Field>
        <Field label="Description">
          <Textarea value={f.description} onChange={(e) => set("description", e.target.value)} />
        </Field>
        <div className="grid grid-cols-3 gap-3">
          {!(node?.type === "VERSION" && node.version && !node.version.is_active) && node?.type !== "TEAM" && (
            <Field label="Status">
              <Select value={f.status} onChange={(e) => set("status", e.target.value as NodeStatus)}>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>{STATUS[s].label}</option>
                ))}
              </Select>
            </Field>
          )}
          <Field label="Owner">
            <Input value={f.owner} onChange={(e) => set("owner", e.target.value)} placeholder="Name" />
          </Field>
          <Field label="Tags">
            <Input value={f.tags} onChange={(e) => set("tags", e.target.value)} placeholder="comma, separated" />
          </Field>
        </div>

        {isPoc && mode === "create" && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Importance weight" hint="Weight in team progress">
              <Input type="number" min={0.5} step={0.5} value={f.importance} onChange={(e) => set("importance", e.target.value)} />
            </Field>
            <Field label="Research outcome">
              <Select value={f.outcome} onChange={(e) => set("outcome", e.target.value as ResearchOutcome)}>
                {Object.entries(OUTCOMES).map(([k, o]) => (
                  <option key={k} value={k}>{o.label}</option>
                ))}
              </Select>
            </Field>
          </div>
        )}

        {(isResource || node?.resource) && (
          <div className="space-y-3 rounded-xl border border-border bg-bg-elev/60 p-3">
            <div className="grid grid-cols-[1fr_180px] gap-3">
              <Field label="URL" hint="External link (repository, paper, doc, demo)">
                <Input value={f.uri} onChange={(e) => set("uri", e.target.value)} placeholder="https://…" />
              </Field>
              <Field label="Resource kind">
                <Select value={f.resourceType} onChange={(e) => set("resourceType", e.target.value as ResourceType)}>
                  <option value="">Default</option>
                  {RESOURCE_KINDS.map((k) => (
                    <option key={k.value} value={k.value}>{k.label}</option>
                  ))}
                </Select>
              </Field>
            </div>
            <div className="flex items-center gap-3">
              <input ref={fileInput} type="file" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
              <Button size="sm" variant="outline" onClick={() => fileInput.current?.click()} loading={uploading}>
                <Upload className="h-3.5 w-3.5" /> Attach file
              </Button>
              <span className="truncate text-xs text-muted">{f.fileRef ? f.fileRef.split("_").slice(1).join("_") : "No file attached"}</span>
            </div>
          </div>
        )}

        {(META_FIELDS[f.type] ?? []).length > 0 && (
          <div className="grid grid-cols-2 gap-3">
            {(META_FIELDS[f.type] ?? []).map((fld) => (
              <div key={fld.key} className={fld.multiline ? "col-span-2" : ""}>
                <Field label={fld.label}>
                  {fld.multiline ? (
                    <Textarea className="min-h-[56px]" value={f.meta[fld.key] ?? ""} onChange={(e) => set("meta", { ...f.meta, [fld.key]: e.target.value })} />
                  ) : (
                    <Input value={f.meta[fld.key] ?? ""} onChange={(e) => set("meta", { ...f.meta, [fld.key]: e.target.value })} />
                  )}
                </Field>
              </div>
            ))}
          </div>
        )}
        {f.type === "EXPERIMENT" && (
          <Field label="Metrics" hint="One per line: name=value (numbers are charted on the Experiments page)">
            <Textarea className="font-mono text-xs" value={f.metrics} onChange={(e) => set("metrics", e.target.value)} placeholder={"nDCG@10=0.63\np95 latency (ms)=310"} />
          </Field>
        )}
        {f.type === "FINDING" && (
          <Field label="Confidence">
            <Select value={f.confidence} onChange={(e) => set("confidence", e.target.value)}>
              <option value="TENTATIVE">Tentative</option>
              <option value="CONFIRMED">Confirmed</option>
            </Select>
          </Field>
        )}
        {error && <div className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">{error}</div>}
      </div>
    </Dialog>
  );
}

/** Mounted only while open, so every opening starts from fresh form state. */
export function NodeFormDialog(props: Parameters<typeof NodeFormDialogInner>[0]) {
  return props.open ? <NodeFormDialogInner {...props} /> : null;
}
