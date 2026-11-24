"use client";

import { ConfirmDialog } from "@/components/ui/dialog";
import { api } from "@/lib/api";
import { NODE_TYPES } from "@/lib/meta";
import { useApiMutation, useGraph } from "@/lib/queries";
import type { GraphNode } from "@/lib/types";

export function DeleteNodeDialog({ node, onClose, onDeleted }: { node: GraphNode | null; onClose: () => void; onDeleted?: () => void }) {
  const { data: graph } = useGraph();
  const m = useApiMutation((id: string) => api.deleteNode(id, true), {
    success: (r) => `Deleted (${r.deleted_edges.length} relationship(s) removed)`,
    onSuccess: () => {
      onDeleted?.();
      onClose();
    },
  });
  if (!node) return null;
  const edgeCount = graph?.edges.filter((e) => e.source_id === node.id || e.target_id === node.id).length ?? 0;
  const versions = node.type === "POC" ? node.poc?.version_count ?? 0 : 0;
  return (
    <ConfirmDialog
      open={!!node}
      onClose={onClose}
      onConfirm={() => m.mutate(node.id)}
      loading={m.isPending}
      title={`Delete ${NODE_TYPES[node.type].label.toLowerCase()}?`}
      message={
        <div className="space-y-2">
          <p>
            <span className="font-medium text-text">{node.title}</span> will be permanently deleted.
          </p>
          <ul className="list-disc space-y-1 pl-5 text-xs">
            <li>{edgeCount} relationship(s) will be removed with it.</li>
            {versions > 0 && <li>{versions} version(s) and their deliverables and evidence will be deleted.</li>}
            <li>Connected resources are kept. Evidence that points to this node keeps its URL.</li>
            <li>Consider archiving instead if you only want to hide it.</li>
          </ul>
        </div>
      }
    />
  );
}
