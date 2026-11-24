"use client";

import { ConfirmDialog } from "@/components/ui/dialog";
import { api } from "@/lib/api";
import { RELATIONSHIPS } from "@/lib/meta";
import { useApiMutation } from "@/lib/queries";
import type { Graph, GraphEdge } from "@/lib/types";

const PROTECTED = new Set(["HAS_VERSION", "VERSION_OF", "OWNS"]);

export function DeleteEdgeDialog({ edge, graph, onClose }: { edge: GraphEdge | null; graph: Graph; onClose: () => void }) {
  const m = useApiMutation((id: string) => api.deleteEdge(id), { success: "Relationship removed", onSuccess: onClose });
  if (!edge) return null;
  const s = graph.nodes.find((n) => n.id === edge.source_id);
  const t = graph.nodes.find((n) => n.id === edge.target_id);
  const locked = PROTECTED.has(edge.relationship);
  return (
    <ConfirmDialog
      open={!!edge}
      onClose={onClose}
      onConfirm={() => (locked ? onClose() : m.mutate(edge.id))}
      loading={m.isPending}
      title={locked ? "Structural relationship" : "Remove relationship?"}
      confirmLabel={locked ? "OK" : "Remove"}
      danger={!locked}
      message={
        <div className="space-y-2">
          <div className="rounded-lg border border-border bg-bg-elev px-3 py-2 text-text">
            {s?.title} <span className="text-faint">— {RELATIONSHIPS[edge.relationship].label.toLowerCase()} →</span> {t?.title}
          </div>
          {locked ? (
            <p>Ownership and version relationships are managed by the initiative lifecycle and can’t be removed directly.</p>
          ) : (
            <p>Both nodes are kept. The removal is recorded in the activity log.</p>
          )}
        </div>
      }
    />
  );
}
