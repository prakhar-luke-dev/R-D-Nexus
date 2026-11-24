"use client";

import { ArrowRight } from "lucide-react";
import { useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Button, Field, Select } from "@/components/ui/primitives";
import { api } from "@/lib/api";
import { RELATIONSHIPS, USER_RELATIONSHIPS } from "@/lib/meta";
import { useApiMutation, useGraph } from "@/lib/queries";
import type { Relationship } from "@/lib/types";
import { NodePicker } from "./NodePicker";

const HINTS: Partial<Record<Relationship, string>> = {
  CONTAINS: "Hierarchical: the target appears under the source when expanded.",
  SHARES_RESOURCE: "Hierarchical: link an existing resource into another initiative/version without duplicating it.",
  PRODUCED: "Hierarchical: an experiment or initiative produced a finding or artifact.",
  REFERENCES: "Cross-link drawn between visible nodes.",
  DERIVED_FROM: "Cross-link: this initiative or version was derived from another.",
};

function RelationshipDialogInner({
  open,
  onClose,
  sourceId,
  targetId,
}: {
  open: boolean;
  onClose: () => void;
  sourceId: string | null;
  targetId: string | null;
}) {
  const { data: graph } = useGraph();
  const [src, setSrc] = useState(sourceId ?? "");
  const [tgt, setTgt] = useState(targetId ?? "");
  const [rel, setRel] = useState<Relationship>("REFERENCES");

  const m = useApiMutation(() => api.createEdge({ source_id: src, target_id: tgt, relationship: rel }), {
    success: "Relationship created",
    onSuccess: onClose,
  });
  const nodes = graph?.nodes ?? [];

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Create relationship"
      description="Relationships are typed edges; the same resource can connect to many initiatives."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!src || !tgt || src === tgt} loading={m.isPending} onClick={() => m.mutate(undefined)}>
            Create
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
          <Field label="Source">
            <NodePicker nodes={nodes} value={src} onChange={setSrc} exclude={tgt ? [tgt] : []} />
          </Field>
          <ArrowRight className="mb-2.5 h-4 w-4 text-faint" />
          <Field label="Target">
            <NodePicker nodes={nodes} value={tgt} onChange={setTgt} exclude={src ? [src, ...(graph ? [graph.root_id] : [])] : []} />
          </Field>
        </div>
        <Field label="Relationship" hint={HINTS[rel]}>
          <Select value={rel} onChange={(e) => setRel(e.target.value as Relationship)}>
            {USER_RELATIONSHIPS.map((r) => (
              <option key={r} value={r}>{RELATIONSHIPS[r].label}</option>
            ))}
          </Select>
        </Field>
      </div>
    </Dialog>
  );
}

/** Mounted only while open, so every opening starts from fresh form state. */
export function RelationshipDialog(props: Parameters<typeof RelationshipDialogInner>[0]) {
  return props.open ? <RelationshipDialogInner {...props} /> : null;
}
