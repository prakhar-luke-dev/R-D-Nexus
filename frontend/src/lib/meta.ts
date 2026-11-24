import {
  BookOpen,
  Boxes,
  Code2,
  FileText,
  FlaskConical,
  GitBranch,
  Lightbulb,
  type LucideIcon,
  MonitorPlay,
  Network,
  Rocket,
  Telescope,
} from "lucide-react";
import type {
  CompletionState,
  EvidenceType,
  NodeStatus,
  NodeType,
  Relationship,
  ResearchOutcome,
  ResourceType,
} from "./types";

export const NODE_TYPES: Record<NodeType, { label: string; plural: string; icon: LucideIcon; hue: string }> = {
  TEAM: { label: "Team", plural: "Team", icon: Network, hue: "#a5b4fc" },
  INITIATIVE: { label: "Initiative", plural: "Initiatives", icon: Rocket, hue: "#a5b4fc" },
  POC: { label: "POC", plural: "POCs", icon: Boxes, hue: "#c7d2fe" },
  VERSION: { label: "Version", plural: "Versions", icon: GitBranch, hue: "#cbd5e1" },
  RESEARCH: { label: "Research", plural: "Research", icon: Telescope, hue: "#93c5fd" },
  EXPERIMENT: { label: "Experiment", plural: "Experiments", icon: FlaskConical, hue: "#c4b5fd" },
  FINDING: { label: "Finding", plural: "Findings", icon: Lightbulb, hue: "#fcd34d" },
  PAPER: { label: "Paper", plural: "Papers", icon: BookOpen, hue: "#f9a8d4" },
  DOCUMENTATION: { label: "Document", plural: "Documents", icon: FileText, hue: "#a7f3d0" },
  CODE: { label: "Code", plural: "Code", icon: Code2, hue: "#7dd3fc" },
  DEMO: { label: "Demo", plural: "Demos", icon: MonitorPlay, hue: "#fdba74" },
};

export const CREATABLE_CHILD_TYPES: NodeType[] = [
  "RESEARCH",
  "EXPERIMENT",
  "FINDING",
  "PAPER",
  "DOCUMENTATION",
  "CODE",
  "DEMO",
];

export const RESOURCE_TYPES: NodeType[] = ["PAPER", "DOCUMENTATION", "CODE", "DEMO"];

export const STATUS: Record<NodeStatus, { label: string; color: string }> = {
  PLANNED: { label: "Planned", color: "var(--text-faint)" },
  IN_PROGRESS: { label: "In progress", color: "var(--info)" },
  BLOCKED: { label: "Blocked", color: "var(--danger)" },
  ON_HOLD: { label: "On hold", color: "var(--warn)" },
  COMPLETED: { label: "Completed", color: "var(--ok)" },
  HISTORICAL: { label: "Historical", color: "var(--text-faint)" },
  ARCHIVED: { label: "Archived", color: "var(--text-faint)" },
};

export const OUTCOMES: Record<ResearchOutcome, { label: string; color: string; hint: string }> = {
  PENDING: { label: "Pending", color: "var(--text-faint)", hint: "Research still running" },
  VALIDATED: { label: "Validated", color: "var(--ok)", hint: "Approach works as hypothesised" },
  PARTIALLY_VALIDATED: { label: "Partially validated", color: "#a3e635", hint: "Works with caveats" },
  INCONCLUSIVE: { label: "Inconclusive", color: "var(--warn)", hint: "Evidence insufficient either way" },
  REJECTED: { label: "Rejected", color: "var(--danger)", hint: "Approach shown not to be viable — a valid result" },
  READY_FOR_PRODUCTION: { label: "Ready for production", color: "var(--accent)", hint: "Hand-off ready" },
};

export const STATES: { value: CompletionState; label: string; score: number }[] = [
  { value: "NOT_STARTED", label: "Not started", score: 0 },
  { value: "STARTED", label: "Started", score: 0.25 },
  { value: "PARTIAL", label: "Partial", score: 0.5 },
  { value: "IMPLEMENTED", label: "Implemented", score: 0.75 },
  { value: "VERIFIED", label: "Verified", score: 1 },
];
export const stateLabel = (s: CompletionState) => STATES.find((x) => x.value === s)?.label ?? s;

export const RELATIONSHIPS: Record<Relationship, { label: string; dashed: boolean; color: string }> = {
  OWNS: { label: "Owns", dashed: false, color: "#3f4a5c" },
  HAS_VERSION: { label: "Has version", dashed: false, color: "#55627a" },
  VERSION_OF: { label: "Version of", dashed: false, color: "#55627a" },
  DERIVED_FROM: { label: "Derived from", dashed: true, color: "#8b93f5" },
  CONTAINS: { label: "Contains", dashed: false, color: "#334052" },
  REFERENCES: { label: "References", dashed: true, color: "#4b5a70" },
  SHARES_RESOURCE: { label: "Shares resource", dashed: true, color: "#2f8f86" },
  PRODUCED: { label: "Produced", dashed: false, color: "#8a7440" },
};

export const USER_RELATIONSHIPS: Relationship[] = [
  "CONTAINS",
  "REFERENCES",
  "SHARES_RESOURCE",
  "PRODUCED",
  "DERIVED_FROM",
];

export const EVIDENCE_TYPES: { value: EvidenceType; label: string }[] = [
  { value: "BENCHMARK", label: "Benchmark result" },
  { value: "EXPERIMENT_REPORT", label: "Experiment report" },
  { value: "RESEARCH_DOC", label: "Research document" },
  { value: "TEST_RESULT", label: "Test result" },
  { value: "FINDING", label: "Technical finding" },
  { value: "DEMO_RECORDING", label: "Demo recording" },
  { value: "REPOSITORY", label: "Code / repository" },
  { value: "OTHER", label: "Other" },
];

export const RESOURCE_KINDS: { value: ResourceType; label: string }[] = [
  { value: "PAPER", label: "Paper" },
  { value: "DOCUMENT", label: "Document" },
  { value: "ARCHITECTURE_NOTE", label: "Architecture note" },
  { value: "REPOSITORY", label: "Repository" },
  { value: "EXPERIMENT_REPORT", label: "Experiment report" },
  { value: "DEMO", label: "Demo" },
  { value: "TECHNICAL_NOTE", label: "Technical note" },
  { value: "EXTERNAL_LINK", label: "External link" },
];

export const fmtPct = (v: number | null | undefined, digits = 1) =>
  v === null || v === undefined ? "—" : `${v.toFixed(digits).replace(/\.0+$/, "")}%`;

export function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export function timeAgo(iso: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d ago`;
  return fmtDate(iso);
}

