"use client";

import { useMemo, useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Button, Field, Input, Textarea } from "@/components/ui/primitives";
import { api } from "@/lib/api";
import { NODE_TYPES } from "@/lib/meta";
import { useApiMutation, useGraph } from "@/lib/queries";
import type { GraphNode } from "@/lib/types";

const REUSABLE = new Set(["RESEARCH", "EXPERIMENT", "FINDING", "PAPER", "DOCUMENTATION", "CODE", "DEMO"]);

function CreateVersionDialogInner({
  open,
  onClose,
  poc,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  poc: GraphNode | null;
  onCreated?: (versionId: string) => void;
}) {
  const { data: graph } = useGraph();
  const activeVersionId = poc?.poc?.active_version_id ?? null;
  const versionCount = poc?.poc?.version_count ?? 0;

  // Resources currently linked to the active version are offered for reuse (linked, not copied).
  const candidates = useMemo(() => {
    if (!graph || !activeVersionId) return [] as GraphNode[];
    const ids = graph.edges
      .filter((e) => e.source_id === activeVersionId && ["CONTAINS", "SHARES_RESOURCE"].includes(e.relationship))
      .map((e) => e.target_id);
    return graph.nodes.filter((n) => ids.includes(n.id) && REUSABLE.has(n.type));
  }, [graph, activeVersionId]);

  const [label, setLabel] = useState(`v${versionCount + 1}`);
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [reuse, setReuse] = useState<string[]>([]);
  const [makeActive, setMakeActive] = useState(true);

  const m = useApiMutation(
    () =>
      api.createVersion(poc!.id, {
        version_label: label.trim(),
        headline: title.trim() || null,
        description: desc.trim() || title.trim(),
        make_active: makeActive,
        reuse_node_ids: reuse,
      }),
    {
      success: (v) => `${v.title} created${makeActive ? " and set active" : ""}`,
      onSuccess: (v) => {
        onCreated?.(v.id);
        onClose();
      },
    },
  );

  if (!poc) return null;
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`New version of ${poc.title}`}
      description="A new version starts with its own fresh deliverables and progress: nothing is inherited. Shared resources are linked, not duplicated."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!label.trim()} loading={m.isPending} onClick={() => m.mutate(undefined)}>
            Create version
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-[120px_1fr] gap-3">
          <Field label="Label">
            <Input value={label} onChange={(e) => setLabel(e.target.value)} />
          </Field>
          <Field label="Headline">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. New TTS architecture" />
          </Field>
        </div>
        <Field label="Description">
          <Textarea value={desc} onChange={(e) => setDesc(e.target.value)} />
        </Field>
        <label className="flex items-start gap-2.5 text-sm">
          <input type="checkbox" className="mt-1 accent-[var(--accent)]" checked={makeActive} onChange={(e) => setMakeActive(e.target.checked)} />
          <span>
            <span className="text-text">Make this the active version</span>
            <span className="block text-xs text-muted">
              The current active version becomes historical (read-only, still visible). Team progress switches to the new version.
            </span>
          </span>
        </label>
        {candidates.length > 0 && (
          <div>
            <div className="mb-2 text-xs font-medium text-muted">Share resources from the current version</div>
            <div className="max-h-52 space-y-1 overflow-y-auto rounded-xl border border-border bg-bg-elev/60 p-2">
              {candidates.map((n) => {
                const Icon = NODE_TYPES[n.type].icon;
                const on = reuse.includes(n.id);
                return (
                  <label key={n.id} className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm hover:bg-surface-2">
                    <input
                      type="checkbox"
                      className="accent-[var(--accent)]"
                      checked={on}
                      onChange={() => setReuse((r) => (on ? r.filter((x) => x !== n.id) : [...r, n.id]))}
                    />
                    <Icon className="h-3.5 w-3.5" style={{ color: NODE_TYPES[n.type].hue }} />
                    <span className="truncate text-text">{n.title}</span>
                    <span className="ml-auto text-[10px] uppercase tracking-wider text-faint">{NODE_TYPES[n.type].label}</span>
                  </label>
                );
              })}
            </div>
            <div className="mt-1.5 text-[11px] text-faint">
              Evidence from the old version is <em>not</em> carried over. Accept it explicitly per deliverable later.
            </div>
          </div>
        )}
      </div>
    </Dialog>
  );
}

/** Mounted only while open, so every opening starts from fresh form state. */
export function CreateVersionDialog(props: Parameters<typeof CreateVersionDialogInner>[0]) {
  return props.open ? <CreateVersionDialogInner {...props} /> : null;
}
