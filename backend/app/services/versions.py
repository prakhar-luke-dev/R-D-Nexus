"""POC initiative and version lifecycle."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app import schemas
from app.enums import (
    RESOURCE_NODE_TYPES,
    NodeStatus,
    NodeType,
    Relationship,
    ResearchOutcome,
)
from app.models import Edge, Node, PocInitiative, PocVersion, Team, utcnow
from app.services.common import DomainError, get_or_404, log_activity
from app.services.graph import GraphContext, _create_edge, get_root, progress_out
from app.services.progress_service import record_snapshots
from app.services.templates import instantiate_deliverables

# Node types that can be linked (shared) into a new version without being duplicated.
REUSABLE_TYPES = RESOURCE_NODE_TYPES | {NodeType.RESEARCH, NodeType.EXPERIMENT, NodeType.FINDING}


def get_initiative(db: Session, poc_id: str) -> PocInitiative:
    return get_or_404(db, PocInitiative, poc_id, "Initiative")


def create_poc(db: Session, team: Team, data: schemas.NodeCreate, actor: str) -> Node:
    root = get_root(db, team.id)
    n = Node(
        team_id=team.id,
        type=NodeType.POC,
        title=data.title,
        description=data.description,
        status=data.status,
        owner=data.owner,
        tags=data.tags,
        meta=data.metadata,
        position_x=data.position.x if data.position else None,
        position_y=data.position.y if data.position else None,
        created_by=actor,
    )
    db.add(n)
    db.flush()
    ini = PocInitiative(
        node_id=n.id,
        importance_weight=data.importance_weight or 1.0,
        research_outcome=data.research_outcome or ResearchOutcome.PENDING,
    )
    db.add(ini)
    db.add(Edge(source_id=root.id, target_id=n.id, relationship=Relationship.OWNS, created_by=actor))
    db.flush()
    log_activity(
        db, team_id=team.id, actor=actor, node=n, action="POC_CREATED",
        new={"importance_weight": ini.importance_weight},
        description=f"New POC “{n.title}” created (importance {ini.importance_weight:g})",
    )
    _new_version(
        db, ini, schemas.VersionCreate(version_label=data.initial_version_label or "v1",
                                       description="Initial version", owner=data.owner),
        actor, commit=False,
    )
    db.commit()
    db.refresh(n)
    return n


def _new_version(
    db: Session, ini: PocInitiative, data: schemas.VersionCreate, actor: str, commit: bool = True
) -> PocVersion:
    poc_node = ini.node
    label = data.version_label.strip()
    if any(v.version_label.lower() == label.lower() for v in ini.versions):
        raise DomainError(f"{poc_node.title} already has a version “{label}”.", 409, "duplicate_version")

    previous = db.get(PocVersion, data.derived_from_id) if data.derived_from_id else (
        db.get(PocVersion, ini.active_version_id) if ini.active_version_id else None
    )
    if previous is not None and previous.initiative_id != ini.node_id:
        raise DomainError("A version can only derive from a version of the same initiative.")

    vnode = Node(
        team_id=poc_node.team_id,
        type=NodeType.VERSION,
        title=f"{poc_node.title} {label}" if not data.title else data.title,
        description=data.description,
        status=NodeStatus.PLANNED if not data.make_active else NodeStatus.IN_PROGRESS,
        owner=data.owner or poc_node.owner,
        meta={"version_label": label, "headline": (data.headline or "").strip() or data.description[:80]},
        created_by=actor,
    )
    db.add(vnode)
    db.flush()
    v = PocVersion(node_id=vnode.id, initiative_id=ini.node_id, version_label=label, is_active=False)
    db.add(v)
    db.flush()
    db.expire(ini, ["versions"])
    db.add(Edge(source_id=poc_node.id, target_id=vnode.id, relationship=Relationship.HAS_VERSION, created_by=actor))
    if previous is not None:
        db.add(Edge(source_id=vnode.id, target_id=previous.node_id, relationship=Relationship.DERIVED_FROM,
                    created_by=actor))
    db.flush()

    # A new version always starts from scratch: fresh deliverables, nothing inherited.
    instantiate_deliverables(db, v.node_id)

    for rid in dict.fromkeys(data.reuse_node_ids):
        res = get_or_404(db, Node, rid, "Reused node")
        if res.type not in REUSABLE_TYPES:
            raise DomainError(f"“{res.title}” cannot be shared into a version.")
        _create_edge(db, vnode, res, Relationship.SHARES_RESOURCE, {"reused": True}, actor, log=False)

    log_activity(
        db, team_id=poc_node.team_id, actor=actor, node=vnode, action="VERSION_CREATED",
        new={"version_label": label, "derived_from": previous.version_label if previous else None,
             "shared_resources": len(data.reuse_node_ids)},
        description=f"New version {label} of {poc_node.title}"
        + (f", derived from {previous.version_label}" if previous else "")
        + (f"; {len(data.reuse_node_ids)} resource(s) shared" if data.reuse_node_ids else ""),
    )
    if data.make_active:
        _activate(db, ini, v, actor)
    record_snapshots(db, poc_node.team_id, v)
    if commit:
        db.commit()
    db.refresh(v)
    return v


def create_version(db: Session, poc_id: str, data: schemas.VersionCreate, actor: str) -> PocVersion:
    ini = get_initiative(db, poc_id)
    return _new_version(db, ini, data, actor)


def _activate(db: Session, ini: PocInitiative, v: PocVersion, actor: str) -> None:
    now = utcnow()
    for other in ini.versions:
        if other.node_id != v.node_id and other.is_active:
            other.is_active = False
            other.superseded_at = now
            other.node.status = NodeStatus.HISTORICAL
    v.is_active = True
    v.superseded_at = None
    if v.node.status in (NodeStatus.HISTORICAL, NodeStatus.PLANNED):
        v.node.status = NodeStatus.IN_PROGRESS
    previous = ini.active_version_id
    ini.active_version_id = v.node_id
    db.flush()
    if previous != v.node_id:
        log_activity(
            db, team_id=ini.node.team_id, actor=actor, node=ini.node, action="ACTIVE_VERSION_CHANGED",
            old={"active_version_id": previous}, new={"active_version_id": v.node_id},
            description=f"{ini.node.title}: active version is now {v.version_label}",
        )


def activate_version(db: Session, version_id: str, actor: str) -> PocVersion:
    v = get_or_404(db, PocVersion, version_id, "Version")
    ini = v.initiative
    if ini.active_version_id == v.node_id and v.is_active:
        return v
    _activate(db, ini, v, actor)
    record_snapshots(db, ini.node.team_id, v)
    db.commit()
    db.refresh(v)
    return v


def patch_poc(db: Session, poc_id: str, data: schemas.PocPatch, actor: str) -> PocInitiative:
    ini = get_initiative(db, poc_id)
    n = ini.node
    if data.importance_weight is not None and data.importance_weight != ini.importance_weight:
        old = ini.importance_weight
        ini.importance_weight = data.importance_weight
        log_activity(
            db, team_id=n.team_id, actor=actor, node=n, action="IMPORTANCE_CHANGED",
            old={"importance_weight": old}, new={"importance_weight": data.importance_weight, "reason": data.reason},
            description=f"{n.title} importance {old:g} → {data.importance_weight:g}"
            + (f". Reason: {data.reason}" if data.reason else ""),
        )
    if data.research_outcome is not None and data.research_outcome != ini.research_outcome:
        old = ini.research_outcome
        ini.research_outcome = data.research_outcome
        log_activity(
            db, team_id=n.team_id, actor=actor, node=n, action="OUTCOME_CHANGED",
            old={"research_outcome": old}, new={"research_outcome": data.research_outcome},
            description=f"{n.title} research outcome: {old.replace('_', ' ').title()} → "
            f"{data.research_outcome.replace('_', ' ').title()}",
        )
    if data.is_active is not None and data.is_active != ini.is_active:
        ini.is_active = data.is_active
        log_activity(
            db, team_id=n.team_id, actor=actor, node=n, action="STATUS_CHANGED",
            new={"is_active": data.is_active},
            description=f"{n.title} {'re-activated' if data.is_active else 'deactivated'} for team progress",
        )
    record_snapshots(db, n.team_id, None)
    db.commit()
    db.refresh(ini)
    return ini


# --- Read helpers ---------------------------------------------------------------------------


def poc_summaries(db: Session, team_id: str) -> list[schemas.PocSummaryOut]:
    ctx = GraphContext(db, team_id)
    out = []
    for ini in ctx.initiatives:
        n = ini.node
        active = ctx.versions.get(ini.active_version_id) if ini.active_version_id else None
        out.append(
            schemas.PocSummaryOut(
                id=n.id,
                title=n.title,
                description=n.description,
                owner=n.owner,
                status=n.status,
                importance_weight=ini.importance_weight,
                research_outcome=ini.research_outcome,
                is_active=ini.is_active,
                archived_at=n.archived_at,
                current_version_id=active.node_id if active else None,
                current_version_label=active.version_label if active else None,
                progress=progress_out(ctx.vp.get(active.node_id) if active else None),
                blocked_count=ctx.blocked(ini.active_version_id),
                version_count=len(ini.versions),
                updated_at=max([n.updated_at] + [v.node.updated_at for v in ini.versions]),
            )
        )
    return out


def version_out(ctx: GraphContext, v: PocVersion, db: Session) -> schemas.VersionOut:
    rels = [Relationship.CONTAINS, Relationship.SHARES_RESOURCE, Relationship.PRODUCED]
    count = len(
        db.scalars(select(Edge.id).where(Edge.source_id == v.node_id, Edge.relationship.in_(rels))).all()
    )
    return schemas.VersionOut(
        id=v.node_id,
        initiative_id=v.initiative_id,
        version_label=v.version_label,
        title=v.node.title,
        description=v.node.description,
        status=v.node.status,
        is_active=v.is_active,
        created_at=v.created_at,
        updated_at=v.node.updated_at,
        superseded_at=v.superseded_at,
        progress=progress_out(ctx.vp.get(v.node_id)),
        blocked_count=ctx.blocked(v.node_id),
        resource_count=count,
    )


def list_versions(db: Session, poc_id: str) -> list[schemas.VersionOut]:
    ini = get_initiative(db, poc_id)
    ctx = GraphContext(db, ini.node.team_id)
    fresh = ctx.by_poc[ini.node_id]
    return [version_out(ctx, v, db) for v in fresh.versions]
