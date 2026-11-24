"""API DTOs. Mirrored by frontend/src/lib/types.ts."""

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.enums import (
    CompletionState,
    EvidenceType,
    NodeStatus,
    NodeType,
    Relationship,
    ResearchOutcome,
    ResourceType,
)


class ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# --- Progress -------------------------------------------------------------------------------


class ProgressOut(BaseModel):
    code_progress: float | None
    validation_progress: float | None
    overall_progress: float | None


class LineItemOut(BaseModel):
    deliverable_id: str | None
    title: str
    weight: float
    normalized_weight: float
    score: float
    contribution: float


class VersionProgressOut(ProgressOut):
    node_id: str
    status: str
    last_updated: datetime
    code_breakdown: list[LineItemOut]
    validation_breakdown: list[LineItemOut]
    blockers: list["BlockerOut"]


class BlockerOut(BaseModel):
    deliverable_id: str
    title: str
    category: str
    reason: str | None
    version_id: str
    version_title: str


class TeamContributionOut(BaseModel):
    initiative_id: str
    initiative_title: str
    version_id: str
    version_label: str
    importance: float
    code_progress: float | None
    validation_progress: float | None
    overall_progress: float | None


class TeamProgressOut(ProgressOut):
    contributions: list[TeamContributionOut]


# --- Graph ----------------------------------------------------------------------------------


class Position(BaseModel):
    x: float
    y: float


class PocInfo(BaseModel):
    importance_weight: float
    active_version_id: str | None
    active_version_label: str | None
    research_outcome: str
    is_active: bool
    version_count: int


class VersionInfo(BaseModel):
    initiative_id: str
    version_label: str
    is_active: bool
    superseded_at: datetime | None


class ResourceInfo(BaseModel):
    resource_type: str
    uri: str | None
    file_reference: str | None


class NodeOut(BaseModel):
    id: str
    type: str
    title: str
    description: str
    status: str
    owner: str | None
    tags: list[str]
    metadata: dict[str, Any]
    position: Position | None
    created_by: str | None
    created_at: datetime
    updated_at: datetime
    archived_at: datetime | None
    progress: ProgressOut | None = None
    blocked_count: int = 0
    poc: PocInfo | None = None
    version: VersionInfo | None = None
    resource: ResourceInfo | None = None


class EdgeOut(ORM):
    id: str
    source_id: str
    target_id: str
    relationship: str
    metadata: dict[str, Any] = Field(validation_alias="meta")
    created_at: datetime


class GraphOut(BaseModel):
    team_id: str
    root_id: str
    nodes: list[NodeOut]
    edges: list[EdgeOut]
    hierarchical_relationships: list[str]
    team_progress: TeamProgressOut


class NodeCreate(BaseModel):
    type: NodeType
    title: str = Field(min_length=1, max_length=300)
    description: str = ""
    status: NodeStatus = NodeStatus.IN_PROGRESS
    owner: str | None = None
    tags: list[str] = []
    metadata: dict[str, Any] = {}
    position: Position | None = None
    # Optional: connect to a parent in the same request.
    parent_id: str | None = None
    relationship: Relationship | None = None
    # Resource fields (for CODE / PAPER / DOCUMENTATION / DEMO)
    resource_type: ResourceType | None = None
    uri: str | None = None
    file_reference: str | None = None
    # POC fields
    importance_weight: float | None = Field(default=None, gt=0)
    research_outcome: ResearchOutcome | None = None
    initial_version_label: str | None = None

    @field_validator("title")
    @classmethod
    def strip_title(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Title is required")
        return v


class NodePatch(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=300)
    description: str | None = None
    status: NodeStatus | None = None
    owner: str | None = None
    tags: list[str] | None = None
    metadata: dict[str, Any] | None = None
    position: Position | None = None
    archived: bool | None = None
    uri: str | None = None
    resource_type: ResourceType | None = None
    file_reference: str | None = None


class EdgeCreate(BaseModel):
    source_id: str
    target_id: str
    relationship: Relationship
    metadata: dict[str, Any] = {}


# --- Initiatives & versions -----------------------------------------------------------------


class PocPatch(BaseModel):
    importance_weight: float | None = Field(default=None, gt=0)
    research_outcome: ResearchOutcome | None = None
    is_active: bool | None = None
    reason: str | None = None


class PocSummaryOut(BaseModel):
    id: str
    title: str
    description: str
    owner: str | None
    status: str
    importance_weight: float
    research_outcome: str
    is_active: bool
    archived_at: datetime | None
    current_version_id: str | None
    current_version_label: str | None
    progress: ProgressOut
    blocked_count: int
    version_count: int
    updated_at: datetime


class VersionOut(BaseModel):
    id: str
    initiative_id: str
    version_label: str
    title: str
    description: str
    status: str
    is_active: bool
    created_at: datetime
    updated_at: datetime
    superseded_at: datetime | None
    progress: ProgressOut
    blocked_count: int
    resource_count: int


class VersionCreate(BaseModel):
    version_label: str = Field(min_length=1, max_length=32)
    title: str | None = None
    headline: str | None = None
    description: str = ""
    owner: str | None = None
    make_active: bool = True
    derived_from_id: str | None = None
    # Existing resource nodes to link (not copy) into the new version.
    reuse_node_ids: list[str] = []


# --- Deliverables & evidence ----------------------------------------------------------------


class EvidenceOut(ORM):
    id: str
    deliverable_id: str
    type: str
    title: str
    uri: str | None
    description: str
    resource_node_id: str | None
    reused_from_evidence_id: str | None
    accepted_by: str | None
    created_by: str | None
    created_at: datetime


class DeliverableOut(ORM):
    id: str
    version_id: str
    category: str
    key: str
    title: str
    description: str
    weight: float
    state: str
    score: float
    ever_started: bool
    is_optional: bool
    is_not_applicable: bool
    not_applicable_reason: str | None
    is_blocked: bool
    blocker_reason: str | None
    verification_exception: bool
    verification_exception_reason: str | None
    updated_by: str | None
    updated_at: datetime
    evidence: list[EvidenceOut]


class DeliverablesOut(BaseModel):
    version_id: str
    is_active: bool
    progress: ProgressOut
    deliverables: list[DeliverableOut]


class DeliverablePatchIn(BaseModel):
    state: CompletionState | None = None
    is_not_applicable: bool | None = None
    not_applicable_reason: str | None = None
    is_blocked: bool | None = None
    blocker_reason: str | None = None
    verification_exception: bool | None = None
    verification_exception_reason: str | None = None
    weight: float | None = Field(default=None, gt=0)
    scope_change_reason: str | None = None


class EvidenceCreate(BaseModel):
    type: EvidenceType = EvidenceType.OTHER
    title: str = Field(min_length=1, max_length=300)
    uri: str | None = None
    description: str = ""
    resource_node_id: str | None = None


class EvidenceReuse(BaseModel):
    target_deliverable_id: str


# --- Activity -------------------------------------------------------------------------------


class ActivityOut(ORM):
    id: str
    actor_id: str
    node_id: str | None
    node_title: str | None
    action: str
    old_value: dict | None
    new_value: dict | None
    description: str
    created_at: datetime


class SnapshotOut(ORM):
    version_id: str | None
    code_score: float | None
    validation_score: float | None
    overall_score: float | None
    calculated_at: datetime


# Upload
class UploadOut(BaseModel):
    file_reference: str
    url: str
    filename: str
    size: int


VersionProgressOut.model_rebuild()

