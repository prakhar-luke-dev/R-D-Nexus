"""Relational node/edge model. Business rules live in app/services; DB constraints enforce structure."""

import uuid
from datetime import UTC, datetime

from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


def new_id() -> str:
    return uuid.uuid4().hex[:16]


def utcnow() -> datetime:
    return datetime.now(UTC)


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )


class Team(TimestampMixin, Base):
    __tablename__ = "teams"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    name: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, default="")


class Node(TimestampMixin, Base):
    __tablename__ = "nodes"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    team_id: Mapped[str] = mapped_column(ForeignKey("teams.id"), index=True)
    type: Mapped[str] = mapped_column(String(32), index=True)
    title: Mapped[str] = mapped_column(String(300))
    description: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(32), default="IN_PROGRESS")
    owner: Mapped[str | None] = mapped_column(String(120), nullable=True)
    tags: Mapped[list] = mapped_column(JSON, default=list)
    # Type-specific attributes (hypothesis, dataset, metrics, ...). See schemas for known keys.
    meta: Mapped[dict] = mapped_column("metadata", JSON, default=dict)
    position_x: Mapped[float | None] = mapped_column(Float, nullable=True)
    position_y: Mapped[float | None] = mapped_column(Float, nullable=True)
    created_by: Mapped[str | None] = mapped_column(String(120), nullable=True)
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    initiative: Mapped["PocInitiative | None"] = relationship(
        back_populates="node", uselist=False, foreign_keys="PocInitiative.node_id"
    )
    version: Mapped["PocVersion | None"] = relationship(
        back_populates="node", uselist=False, foreign_keys="PocVersion.node_id"
    )
    resource: Mapped["Resource | None"] = relationship(back_populates="node", uselist=False)


class Edge(Base):
    __tablename__ = "edges"
    __table_args__ = (
        UniqueConstraint("source_id", "target_id", "relationship", name="uq_edge"),
        CheckConstraint("source_id <> target_id", name="ck_edge_no_self_loop"),
    )
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    source_id: Mapped[str] = mapped_column(ForeignKey("nodes.id"), index=True)
    target_id: Mapped[str] = mapped_column(ForeignKey("nodes.id"), index=True)
    relationship: Mapped[str] = mapped_column(String(32))
    meta: Mapped[dict] = mapped_column("metadata", JSON, default=dict)
    created_by: Mapped[str | None] = mapped_column(String(120), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class PocInitiative(TimestampMixin, Base):
    """1:1 extension of a POC node. Primary key is the node id."""

    __tablename__ = "poc_initiatives"
    __table_args__ = (CheckConstraint("importance_weight > 0", name="ck_importance_positive"),)
    node_id: Mapped[str] = mapped_column(ForeignKey("nodes.id"), primary_key=True)
    importance_weight: Mapped[float] = mapped_column(Float, default=1.0)
    active_version_id: Mapped[str | None] = mapped_column(
        ForeignKey("poc_versions.node_id", use_alter=True, name="fk_initiative_active_version"),
        nullable=True,
    )
    research_outcome: Mapped[str] = mapped_column(String(32), default="PENDING")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    node: Mapped[Node] = relationship(back_populates="initiative", foreign_keys=[node_id])
    versions: Mapped[list["PocVersion"]] = relationship(
        back_populates="initiative",
        foreign_keys="PocVersion.initiative_id",
        order_by="PocVersion.created_at",
    )


class PocVersion(TimestampMixin, Base):
    """1:1 extension of a VERSION node. Primary key is the node id."""

    __tablename__ = "poc_versions"
    __table_args__ = (UniqueConstraint("initiative_id", "version_label", name="uq_version_label"),)
    node_id: Mapped[str] = mapped_column(ForeignKey("nodes.id"), primary_key=True)
    initiative_id: Mapped[str] = mapped_column(ForeignKey("poc_initiatives.node_id"), index=True)
    version_label: Mapped[str] = mapped_column(String(32))
    is_active: Mapped[bool] = mapped_column(Boolean, default=False)
    superseded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    node: Mapped[Node] = relationship(back_populates="version", foreign_keys=[node_id])
    initiative: Mapped[PocInitiative] = relationship(
        back_populates="versions", foreign_keys=[initiative_id]
    )
    deliverables: Mapped[list["Deliverable"]] = relationship(
        back_populates="version", order_by="Deliverable.position", cascade="all, delete-orphan"
    )


class ProgressTemplate(Base):
    __tablename__ = "progress_templates"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    name: Mapped[str] = mapped_column(String(200))
    category: Mapped[str] = mapped_column(String(16))
    description: Mapped[str] = mapped_column(Text, default="")
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)
    items: Mapped[list["TemplateItem"]] = relationship(
        order_by="TemplateItem.position", cascade="all, delete-orphan"
    )


class TemplateItem(Base):
    __tablename__ = "progress_template_items"
    __table_args__ = (CheckConstraint("weight > 0", name="ck_template_weight_positive"),)
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    template_id: Mapped[str] = mapped_column(ForeignKey("progress_templates.id"))
    key: Mapped[str] = mapped_column(String(64))
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, default="")
    weight: Mapped[float] = mapped_column(Float)
    position: Mapped[int] = mapped_column(Integer, default=0)


class Deliverable(TimestampMixin, Base):
    __tablename__ = "deliverables"
    __table_args__ = (CheckConstraint("weight > 0", name="ck_deliverable_weight_positive"),)
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    version_id: Mapped[str] = mapped_column(ForeignKey("poc_versions.node_id"), index=True)
    category: Mapped[str] = mapped_column(String(16))
    key: Mapped[str] = mapped_column(String(64))
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, default="")
    weight: Mapped[float] = mapped_column(Float)
    state: Mapped[str] = mapped_column(String(16), default="NOT_STARTED")
    position: Mapped[int] = mapped_column(Integer, default=0)
    # Set once work has begun, so a deliverable can't be made N/A after the fact.
    ever_started: Mapped[bool] = mapped_column(Boolean, default=False)
    is_optional: Mapped[bool] = mapped_column(Boolean, default=True)
    is_not_applicable: Mapped[bool] = mapped_column(Boolean, default=False)
    not_applicable_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_blocked: Mapped[bool] = mapped_column(Boolean, default=False)
    blocker_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    verification_exception: Mapped[bool] = mapped_column(Boolean, default=False)
    verification_exception_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    updated_by: Mapped[str | None] = mapped_column(String(120), nullable=True)

    version: Mapped[PocVersion] = relationship(back_populates="deliverables")
    evidence: Mapped[list["Evidence"]] = relationship(
        back_populates="deliverable", cascade="all, delete-orphan", order_by="Evidence.created_at"
    )


class Evidence(Base):
    __tablename__ = "evidence"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    deliverable_id: Mapped[str] = mapped_column(ForeignKey("deliverables.id"), index=True)
    type: Mapped[str] = mapped_column(String(32))
    title: Mapped[str] = mapped_column(String(300))
    uri: Mapped[str | None] = mapped_column(Text, nullable=True)
    description: Mapped[str] = mapped_column(Text, default="")
    # Evidence may point at a canonical resource node instead of duplicating it.
    resource_node_id: Mapped[str | None] = mapped_column(ForeignKey("nodes.id"), nullable=True)
    reused_from_evidence_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    accepted_by: Mapped[str | None] = mapped_column(String(120), nullable=True)
    meta: Mapped[dict] = mapped_column("metadata", JSON, default=dict)
    created_by: Mapped[str | None] = mapped_column(String(120), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    deliverable: Mapped[Deliverable] = relationship(back_populates="evidence")


class Resource(TimestampMixin, Base):
    """Canonical record for a resource node (paper, doc, repo, demo). One per node."""

    __tablename__ = "resources"
    node_id: Mapped[str] = mapped_column(ForeignKey("nodes.id"), primary_key=True)
    resource_type: Mapped[str] = mapped_column(String(32))
    uri: Mapped[str | None] = mapped_column(Text, nullable=True)
    file_reference: Mapped[str | None] = mapped_column(Text, nullable=True)
    meta: Mapped[dict] = mapped_column("metadata", JSON, default=dict)

    node: Mapped[Node] = relationship(back_populates="resource")


class ProgressSnapshot(Base):
    """Historical progress. version_id NULL means a team-level snapshot."""

    __tablename__ = "progress_snapshots"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    team_id: Mapped[str] = mapped_column(ForeignKey("teams.id"), index=True)
    version_id: Mapped[str | None] = mapped_column(
        ForeignKey("poc_versions.node_id"), nullable=True, index=True
    )
    code_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    validation_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    overall_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    calculated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class ActivityLog(Base):
    __tablename__ = "activity_log"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    team_id: Mapped[str] = mapped_column(ForeignKey("teams.id"), index=True)
    actor_id: Mapped[str] = mapped_column(String(120))
    # Not a FK: activity history must survive node deletion.
    node_id: Mapped[str | None] = mapped_column(String(32), nullable=True, index=True)
    node_title: Mapped[str | None] = mapped_column(String(300), nullable=True)
    action: Mapped[str] = mapped_column(String(64), index=True)
    old_value: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    new_value: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    description: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
