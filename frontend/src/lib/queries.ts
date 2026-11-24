"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import { toast } from "./toast";

export const qk = {
  graph: ["graph"] as const,
  node: (id: string) => ["node", id] as const,
  deliverables: (id: string) => ["deliverables", id] as const,
  versionProgress: (id: string) => ["versionProgress", id] as const,
  versions: (id: string) => ["versions", id] as const,
  pocs: ["pocs"] as const,
  research: ["research"] as const,
  experiments: ["experiments"] as const,
  library: ["library"] as const,
  activity: (p: object) => ["activity", p] as const,
  overview: ["overview"] as const,
  snapshots: (p: object) => ["snapshots", p] as const,
  nodes: (t?: string) => ["nodes", t ?? "all"] as const,
};

export const useGraph = () => useQuery({ queryKey: qk.graph, queryFn: api.graph });
export const useNodeDetail = (id: string | null) =>
  useQuery({ queryKey: qk.node(id ?? ""), queryFn: () => api.node(id!), enabled: !!id });
export const useDeliverables = (versionId: string | null) =>
  useQuery({
    queryKey: qk.deliverables(versionId ?? ""),
    queryFn: () => api.deliverables(versionId!),
    enabled: !!versionId,
  });
export const useVersionProgress = (versionId: string | null) =>
  useQuery({
    queryKey: qk.versionProgress(versionId ?? ""),
    queryFn: () => api.versionProgress(versionId!),
    enabled: !!versionId,
  });
export const useVersions = (pocId: string | null) =>
  useQuery({ queryKey: qk.versions(pocId ?? ""), queryFn: () => api.versions(pocId!), enabled: !!pocId });
export const usePocs = () => useQuery({ queryKey: qk.pocs, queryFn: api.pocs });
export const useExperiments = () => useQuery({ queryKey: qk.experiments, queryFn: api.experiments });
export const useLibrary = () => useQuery({ queryKey: qk.library, queryFn: api.library });
export const useResearch = () => useQuery({ queryKey: qk.research, queryFn: api.research });
export const useActivity = (p: { node_id?: string; action?: string; limit?: number } = {}) =>
  useQuery({ queryKey: qk.activity(p), queryFn: () => api.activity(p) });
export const useOverview = () => useQuery({ queryKey: qk.overview, queryFn: api.overview });
export const useSnapshots = (p: { version_id?: string; team?: boolean }, enabled = true) =>
  useQuery({ queryKey: qk.snapshots(p), queryFn: () => api.snapshots(p), enabled });
export const useNodesOfType = (t?: string) => useQuery({ queryKey: qk.nodes(t), queryFn: () => api.nodes(t) });

/**
 * Wraps a mutation so every success refreshes all server state. Progress is derived on the backend,
 * so one change can affect many rings (the version, its POC and the team). Refetching everything
 * keeps the graph, the panel and the tables consistent without duplicating calculation rules.
 */
export function useApiMutation<TVars, TResult>(
  fn: (vars: TVars) => Promise<TResult>,
  opts: { success?: string | ((r: TResult, v: TVars) => string | undefined); onSuccess?: (r: TResult, v: TVars) => void } = {},
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: async (r, v) => {
      await qc.invalidateQueries();
      const msg = typeof opts.success === "function" ? opts.success(r, v) : opts.success;
      if (msg) toast.success(msg);
      opts.onSuccess?.(r, v);
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
