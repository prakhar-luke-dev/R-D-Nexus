import type {
  Activity,
  Deliverable,
  DeliverablePatch,
  DeliverablesResponse,
  Evidence,
  EvidenceType,
  Graph,
  GraphEdge,
  GraphNode,
  KnowledgeItem,
  NodeCreate,
  NodeDetail,
  NodePatch,
  Overview,
  PocSummary,
  Relationship,
  ResearchOutcome,
  Snapshot,
  TeamProgress,
  VersionCreate,
  VersionProgress,
  VersionSummary,
} from "./types";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
  }
}

const ACTOR_KEY = "rdn.actor";

export function getActor(): string {
  if (typeof window === "undefined") return "demo-user";
  try {
    return localStorage.getItem(ACTOR_KEY) || "demo-user";
  } catch {
    return "demo-user";
  }
}

export function setActor(name: string) {
  try {
    localStorage.setItem(ACTOR_KEY, name);
  } catch {
    /* storage unavailable; the default actor is used */
  }
}

function formatDetail(detail: unknown): string {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    // FastAPI validation errors
    return detail
      .map((d: { loc?: unknown[]; msg?: string }) => {
        const field = Array.isArray(d.loc) ? d.loc.filter((x) => x !== "body").join(".") : "";
        return field ? `${field}: ${d.msg}` : d.msg;
      })
      .join("; ");
  }
  return "Request failed";
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: {
      ...(init.body && !(init.body instanceof FormData) ? { "Content-Type": "application/json" } : {}),
      "X-Actor": getActor(),
      ...init.headers,
    },
  });
  if (!res.ok) {
    let body: { detail?: unknown; code?: string } = {};
    try {
      body = await res.json();
    } catch {
      /* non-JSON error */
    }
    throw new ApiError(
      body.detail ? formatDetail(body.detail) : `${res.status} ${res.statusText}`,
      res.status,
      body.code,
    );
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

const json = (method: string, body?: unknown): RequestInit => ({
  method,
  body: body === undefined ? undefined : JSON.stringify(body),
});

export const api = {
  graph: () => request<Graph>("/graph"),
  node: (id: string) => request<NodeDetail>(`/nodes/${id}`),
  nodes: (type?: string) => request<GraphNode[]>(`/nodes${type ? `?type=${type}` : ""}`),
  createNode: (data: NodeCreate) => request<GraphNode>("/nodes", json("POST", data)),
  patchNode: (id: string, data: NodePatch) => request<GraphNode>(`/nodes/${id}`, json("PATCH", data)),
  deleteNode: (id: string, cascade = false) =>
    request<{ deleted_nodes: string[]; deleted_edges: string[] }>(
      `/nodes/${id}${cascade ? "?cascade_edges=true" : ""}`,
      { method: "DELETE" },
    ),
  createEdge: (data: { source_id: string; target_id: string; relationship: Relationship }) =>
    request<GraphEdge>("/edges", json("POST", data)),
  deleteEdge: (id: string) => request<void>(`/edges/${id}`, { method: "DELETE" }),

  pocs: () => request<PocSummary[]>("/pocs"),
  patchPoc: (
    id: string,
    data: Partial<{ importance_weight: number; research_outcome: ResearchOutcome; is_active: boolean; reason: string }>,
  ) => request<PocSummary>(`/pocs/${id}`, json("PATCH", data)),
  versions: (pocId: string) => request<VersionSummary[]>(`/pocs/${pocId}/versions`),
  createVersion: (pocId: string, data: VersionCreate) =>
    request<VersionSummary>(`/pocs/${pocId}/versions`, json("POST", data)),
  activateVersion: (id: string) => request<VersionSummary>(`/versions/${id}/activate`, json("POST")),

  versionProgress: (id: string) => request<VersionProgress>(`/versions/${id}/progress`),
  teamProgress: () => request<TeamProgress>("/team/progress"),
  deliverables: (versionId: string) => request<DeliverablesResponse>(`/versions/${versionId}/deliverables`),
  patchDeliverable: (id: string, data: DeliverablePatch) =>
    request<Deliverable>(`/deliverables/${id}`, json("PATCH", data)),
  addEvidence: (
    deliverableId: string,
    data: { type: EvidenceType; title: string; uri?: string | null; description?: string; resource_node_id?: string | null },
  ) => request<Evidence>(`/deliverables/${deliverableId}/evidence`, json("POST", data)),
  deleteEvidence: (id: string) => request<void>(`/evidence/${id}`, { method: "DELETE" }),
  reuseEvidence: (id: string, targetDeliverableId: string) =>
    request<Evidence>(`/evidence/${id}/reuse`, json("POST", { target_deliverable_id: targetDeliverableId })),

  research: () => request<KnowledgeItem[]>("/research"),
  experiments: () => request<KnowledgeItem[]>("/experiments"),
  library: () => request<KnowledgeItem[]>("/library"),
  upload: (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return request<{ file_reference: string; url: string; filename: string; size: number }>("/uploads", {
      method: "POST",
      body: fd,
    });
  },

  activity: (params: { node_id?: string; action?: string; limit?: number } = {}) => {
    const q = new URLSearchParams(
      Object.entries(params)
        .filter(([, v]) => v !== undefined && v !== "")
        .map(([k, v]) => [k, String(v)]),
    );
    return request<Activity[]>(`/activity${q.size ? `?${q}` : ""}`);
  },
  overview: () => request<Overview>("/overview"),
  snapshots: (params: { version_id?: string; team?: boolean }) =>
    request<Snapshot[]>(
      `/snapshots?${params.team ? "team=true" : `version_id=${params.version_id ?? ""}`}`,
    ),
};
