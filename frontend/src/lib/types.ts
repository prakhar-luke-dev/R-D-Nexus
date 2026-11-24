// Mirrors backend/app/schemas.py. Progress values are always calculated by the backend.

export type NodeType =
  | "TEAM"
  | "INITIATIVE"
  | "POC"
  | "VERSION"
  | "RESEARCH"
  | "CODE"
  | "EXPERIMENT"
  | "FINDING"
  | "PAPER"
  | "DOCUMENTATION"
  | "DEMO";

export type Relationship =
  | "OWNS"
  | "HAS_VERSION"
  | "VERSION_OF"
  | "DERIVED_FROM"
  | "CONTAINS"
  | "REFERENCES"
  | "SHARES_RESOURCE"
  | "PRODUCED";

export type NodeStatus =
  | "PLANNED"
  | "IN_PROGRESS"
  | "BLOCKED"
  | "ON_HOLD"
  | "COMPLETED"
  | "HISTORICAL"
  | "ARCHIVED";

export type ResearchOutcome =
  | "PENDING"
  | "VALIDATED"
  | "PARTIALLY_VALIDATED"
  | "INCONCLUSIVE"
  | "REJECTED"
  | "READY_FOR_PRODUCTION";

export type CompletionState = "NOT_STARTED" | "STARTED" | "PARTIAL" | "IMPLEMENTED" | "VERIFIED";
export type DeliverableCategory = "CODE" | "VALIDATION";
export type EvidenceType =
  | "BENCHMARK"
  | "EXPERIMENT_REPORT"
  | "RESEARCH_DOC"
  | "TEST_RESULT"
  | "FINDING"
  | "DEMO_RECORDING"
  | "REPOSITORY"
  | "OTHER";
export type ResourceType =
  | "PAPER"
  | "DOCUMENT"
  | "ARCHITECTURE_NOTE"
  | "REPOSITORY"
  | "EXPERIMENT_REPORT"
  | "DEMO"
  | "TECHNICAL_NOTE"
  | "EXTERNAL_LINK";

export interface Progress {
  code_progress: number | null;
  validation_progress: number | null;
  overall_progress: number | null;
}

export interface PocInfo {
  importance_weight: number;
  active_version_id: string | null;
  active_version_label: string | null;
  research_outcome: ResearchOutcome;
  is_active: boolean;
  version_count: number;
}

export interface VersionInfo {
  initiative_id: string;
  version_label: string;
  is_active: boolean;
  superseded_at: string | null;
}

export interface ResourceInfo {
  resource_type: ResourceType;
  uri: string | null;
  file_reference: string | null;
}

export interface GraphNode {
  id: string;
  type: NodeType;
  title: string;
  description: string;
  status: NodeStatus;
  owner: string | null;
  tags: string[];
  metadata: Record<string, unknown>;
  position: { x: number; y: number } | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  progress: Progress | null;
  blocked_count: number;
  poc: PocInfo | null;
  version: VersionInfo | null;
  resource: ResourceInfo | null;
}

export interface GraphEdge {
  id: string;
  source_id: string;
  target_id: string;
  relationship: Relationship;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface TeamContribution {
  initiative_id: string;
  initiative_title: string;
  version_id: string;
  version_label: string;
  importance: number;
  code_progress: number | null;
  validation_progress: number | null;
  overall_progress: number | null;
}

export interface TeamProgress extends Progress {
  contributions: TeamContribution[];
}

export interface Graph {
  team_id: string;
  root_id: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  hierarchical_relationships: Relationship[];
  team_progress: TeamProgress;
}

export interface Activity {
  id: string;
  actor_id: string;
  node_id: string | null;
  node_title: string | null;
  action: string;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  description: string;
  created_at: string;
}

export interface Relation {
  edge: GraphEdge;
  direction: "in" | "out";
  node: GraphNode;
}

export interface NodeDetail {
  node: GraphNode;
  relations: Relation[];
  activity: Activity[];
}

export interface LineItem {
  deliverable_id: string | null;
  title: string;
  weight: number;
  normalized_weight: number;
  score: number;
  contribution: number;
}

export interface Blocker {
  deliverable_id: string;
  title: string;
  category: DeliverableCategory;
  reason: string | null;
  version_id: string;
  version_title: string;
}

export interface VersionProgress extends Progress {
  node_id: string;
  status: NodeStatus;
  last_updated: string;
  code_breakdown: LineItem[];
  validation_breakdown: LineItem[];
  blockers: Blocker[];
}

export interface Evidence {
  id: string;
  deliverable_id: string;
  type: EvidenceType;
  title: string;
  uri: string | null;
  description: string;
  resource_node_id: string | null;
  reused_from_evidence_id: string | null;
  accepted_by: string | null;
  created_by: string | null;
  created_at: string;
}

export interface Deliverable {
  id: string;
  version_id: string;
  category: DeliverableCategory;
  key: string;
  title: string;
  description: string;
  weight: number;
  state: CompletionState;
  score: number;
  ever_started: boolean;
  is_optional: boolean;
  is_not_applicable: boolean;
  not_applicable_reason: string | null;
  is_blocked: boolean;
  blocker_reason: string | null;
  verification_exception: boolean;
  verification_exception_reason: string | null;
  updated_by: string | null;
  updated_at: string;
  evidence: Evidence[];
}

export interface DeliverablesResponse {
  version_id: string;
  is_active: boolean;
  progress: Progress;
  deliverables: Deliverable[];
}

export interface PocSummary {
  id: string;
  title: string;
  description: string;
  owner: string | null;
  status: NodeStatus;
  importance_weight: number;
  research_outcome: ResearchOutcome;
  is_active: boolean;
  archived_at: string | null;
  current_version_id: string | null;
  current_version_label: string | null;
  progress: Progress;
  blocked_count: number;
  version_count: number;
  updated_at: string;
}

export interface VersionSummary {
  id: string;
  initiative_id: string;
  version_label: string;
  title: string;
  description: string;
  status: NodeStatus;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  superseded_at: string | null;
  progress: Progress;
  blocked_count: number;
  resource_count: number;
}

export interface RelatedRef {
  id: string;
  title: string;
  type: NodeType;
  relationship: Relationship;
  direction: "in" | "out";
}

export interface KnowledgeItem {
  node: GraphNode;
  related: RelatedRef[];
}

export interface TrendPoint {
  date: string;
  code_progress: number | null;
  validation_progress: number | null;
  overall_progress: number | null;
}

export interface Overview {
  team_progress: TeamProgress;
  active_poc_count: number;
  completed_poc_count: number;
  blocked: PocSummary[];
  recently_updated: PocSummary[];
  outcomes: Record<string, number>;
  trend: TrendPoint[];
  latest_experiments: GraphNode[];
  recent_activity: Activity[];
}

export interface Snapshot {
  version_id: string | null;
  code_score: number | null;
  validation_score: number | null;
  overall_score: number | null;
  calculated_at: string;
}

// Request payloads
export interface NodeCreate {
  type: NodeType;
  title: string;
  description?: string;
  status?: NodeStatus;
  owner?: string | null;
  tags?: string[];
  metadata?: Record<string, unknown>;
  position?: { x: number; y: number } | null;
  parent_id?: string | null;
  relationship?: Relationship | null;
  resource_type?: ResourceType | null;
  uri?: string | null;
  file_reference?: string | null;
  importance_weight?: number | null;
  research_outcome?: ResearchOutcome | null;
  initial_version_label?: string | null;
}

export type NodePatch = Partial<{
  title: string;
  description: string;
  status: NodeStatus;
  owner: string | null;
  tags: string[];
  metadata: Record<string, unknown>;
  position: { x: number; y: number } | null;
  archived: boolean;
  uri: string | null;
  resource_type: ResourceType;
  file_reference: string | null;
}>;

export type DeliverablePatch = Partial<{
  state: CompletionState;
  is_not_applicable: boolean;
  not_applicable_reason: string;
  is_blocked: boolean;
  blocker_reason: string;
  verification_exception: boolean;
  verification_exception_reason: string;
  weight: number;
  scope_change_reason: string;
}>;

export interface VersionCreate {
  version_label: string;
  title?: string | null;
  headline?: string | null;
  description?: string;
  owner?: string | null;
  make_active?: boolean;
  derived_from_id?: string | null;
  reuse_node_ids?: string[];
}
