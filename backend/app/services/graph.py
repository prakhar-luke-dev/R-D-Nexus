"""Graph read model plus node and edge mutations."""

from datetime import datetime

from sqlalchemy import or_, select
from sqlalchemy.orm import Session, selectinload

from app import schemas
from app.enums import (
    HIERARCHICAL_RELATIONSHIPS,
    RESOURCE_NODE_TYPES,
    NodeStatus,
    NodeType,
    Relationship,
    ResourceType,
)
from app.models import (
    Edge,
    Evidence,
    Node,
    PocInitiative,
    PocVersion,
    ProgressSnapshot,
    Resource,
    Team,
    utcnow,
)
from app.services import progress as engine
from app.services.common import DomainError, NotFound, get_or_404, log_activity
from app.services.progress_service import (
    all_version_progress,
    load_initiatives,
    record_snapshots,
    team_progress_from,
)

DEFAULT_RESOURCE_TYPE = {
    NodeType.CODE: ResourceType.REPOSITORY,
    NodeType.PAPER: ResourceType.PAPER,
    NodeType.DOCUMENTATION: ResourceType.DOCUMENT,
    NodeType.DEMO: ResourceType.DEMO,
}


# --- Read model -----------------------------------------------------------------------------


def get_team(db: Session) -> Team:
    team = db.scalars(select(Team).order_by(Team.created_at)).first()
    if team is None:
        raise NotFound("Team (run the seed: `uv run python -m app.seed`)")
    return team


def get_root(db: Session, team_id: str) -> Node:
    root = db.scalars(select(Node).where(Node.team_id == team_id, Node.type == NodeType.TEAM)).first()
    if root is None:
        raise NotFound("Team root node")
    return root


def progress_out(p: engine.VersionProgress | engine.TeamProgress | None) -> schemas.ProgressOut:
    if p is None:
        return schemas.ProgressOut(code_progress=None, validation_progress=None, overall_progress=None)
    return schemas.ProgressOut(
        code_progress=p.code, validation_progress=p.validation, overall_progress=p.overall
    )


class GraphContext:
    """Precomputed progress for a team: one pass over initiatives, versions and deliverables."""

    def __init__(self, db: Session, team_id: str):
        self.initiatives = load_initiatives(db, team_id)
        self.vp = all_version_progress(self.initiatives)
        self.team = team_progress_from(self.initiatives, self.vp)
        self.versions: dict[str, PocVersion] = {
            v.node_id: v for ini in self.initiatives for v in ini.versions
        }
        self.by_poc: dict[str, PocInitiative] = {i.node_id: i for i in self.initiatives}

    def blocked(self, version_id: str | None) -> int:
        v = self.versions.get(version_id) if version_id else None
        return sum(1 for d in v.deliverables if d.is_blocked) if v else 0

    def team_out(self) -> schemas.TeamProgressOut:
        contribs = []
        for c in self.team.contributions:
            ini = self.by_poc[c.initiative_id]
            v = self.versions[c.version_id]
            contribs.append(
                schemas.TeamContributionOut(
                    initiative_id=c.initiative_id,
                    initiative_title=ini.node.title,
                    version_id=c.version_id,
                    version_label=v.version_label,
                    importance=c.importance,
                    code_progress=c.code,
                    validation_progress=c.validation,
                    overall_progress=self.vp[c.version_id].overall,
                )
            )
        base = progress_out(self.team)
        return schemas.TeamProgressOut(**base.model_dump(), contributions=contribs)

    def node_out(self, n: Node) -> schemas.NodeOut:
        out = schemas.NodeOut(
            id=n.id,
            type=n.type,
            title=n.title,
            description=n.description,
            status=n.status,
            owner=n.owner,
            tags=list(n.tags or []),
            metadata=dict(n.meta or {}),
            position=schemas.Position(x=n.position_x, y=n.position_y)
            if n.position_x is not None and n.position_y is not None
            else None,
            created_by=n.created_by,
            created_at=n.created_at,
            updated_at=n.updated_at,
            archived_at=n.archived_at,
        )
        if n.type == NodeType.TEAM:
            out.progress = progress_out(self.team)
            out.blocked_count = sum(self.blocked(c.version_id) for c in self.team.contributions)
        elif n.type == NodeType.POC and n.id in self.by_poc:
            ini = self.by_poc[n.id]
            active = self.versions.get(ini.active_version_id) if ini.active_version_id else None
            out.progress = progress_out(self.vp.get(active.node_id) if active else None)
            out.blocked_count = self.blocked(ini.active_version_id)
            out.poc = schemas.PocInfo(
                importance_weight=ini.importance_weight,
                active_version_id=ini.active_version_id,
                active_version_label=active.version_label if active else None,
                research_outcome=ini.research_outcome,
                is_active=ini.is_active,
                version_count=len(ini.versions),
            )
        elif n.type == NodeType.VERSION and n.id in self.versions:
            v = self.versions[n.id]
            out.progress = progress_out(self.vp[n.id])
            out.blocked_count = self.blocked(n.id)
            out.version = schemas.VersionInfo(
                initiative_id=v.initiative_id,
                version_label=v.version_label,
                is_active=v.is_active,
                superseded_at=v.superseded_at,
            )
        if n.resource is not None:
            out.resource = schemas.ResourceInfo(
                resource_type=n.resource.resource_type,
                uri=n.resource.uri,
                file_reference=n.resource.file_reference,
            )
        return out


def build_graph(db: Session, include_archived: bool = False) -> schemas.GraphOut:
    team = get_team(db)
    root = get_root(db, team.id)
    ctx = GraphContext(db, team.id)
    q = select(Node).where(Node.team_id == team.id).options(selectinload(Node.resource))
    if not include_archived:
        q = q.where(Node.archived_at.is_(None))
    nodes = list(db.scalars(q.order_by(Node.created_at)))
    ids = {n.id for n in nodes}
    edges = [
        e
        for e in db.scalars(select(Edge).order_by(Edge.created_at))
        if e.source_id in ids and e.target_id in ids
    ]
    return schemas.GraphOut(
        team_id=team.id,
        root_id=root.id,
        nodes=[ctx.node_out(n) for n in nodes],
        edges=[schemas.EdgeOut.model_validate(e) for e in edges],
        hierarchical_relationships=sorted(HIERARCHICAL_RELATIONSHIPS),
        team_progress=ctx.team_out(),
    )


def node_detail(db: Session, node_id: str) -> schemas.NodeOut:
    n = get_or_404(db, Node, node_id, "Node")
    return GraphContext(db, n.team_id).node_out(n)


def neighbours(db: Session, node_id: str) -> tuple[list[Edge], list[Node]]:
    edges = list(
        db.scalars(select(Edge).where(or_(Edge.source_id == node_id, Edge.target_id == node_id)))
    )
    other_ids = {e.target_id if e.source_id == node_id else e.source_id for e in edges}
    nodes = list(db.scalars(select(Node).where(Node.id.in_(other_ids)))) if other_ids else []
    return edges, nodes


# --- Node mutations -------------------------------------------------------------------------


def _set_resource(n: Node, resource_type: str | None, uri: str | None, file_ref: str | None) -> None:
    if n.type not in RESOURCE_NODE_TYPES and not (uri or file_ref):
        return
    if n.resource is None:
        n.resource = Resource(
            resource_type=resource_type or DEFAULT_RESOURCE_TYPE.get(NodeType(n.type), ResourceType.EXTERNAL_LINK),
            uri=uri,
            file_reference=file_ref,
        )
    else:
        if resource_type:
            n.resource.resource_type = resource_type
        if uri is not None:
            n.resource.uri = uri or None
        if file_ref is not None:
            n.resource.file_reference = file_ref or None


def create_node(db: Session, data: schemas.NodeCreate, actor: str) -> Node:
    team = get_team(db)
    if data.type == NodeType.TEAM:
        raise DomainError("A team already has its root node.", 409)
    if data.type == NodeType.VERSION:
        raise DomainError("Create versions through POST /api/pocs/{id}/versions.", 422)
    if data.type in (NodeType.POC, NodeType.INITIATIVE):
        from app.services.versions import create_poc  # local import: avoids a cycle

        return create_poc(db, team, data, actor)

    parent = get_or_404(db, Node, data.parent_id, "Parent node") if data.parent_id else None
    n = Node(
        team_id=team.id,
        type=data.type,
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
    _set_resource(n, data.resource_type, data.uri, data.file_reference)
    if parent is not None:
        rel = data.relationship or (
            Relationship.PRODUCED if data.type == NodeType.FINDING and parent.type == NodeType.EXPERIMENT
            else Relationship.CONTAINS
        )
        _create_edge(db, parent, n, rel, {}, actor, log=False)
    log_activity(
        db, team_id=team.id, actor=actor, node=n, action="NODE_CREATED",
        new={"type": n.type, "parent_id": data.parent_id},
        description=f"{_type_label(n.type)} “{n.title}” added" + (f" to {parent.title}" if parent else ""),
    )
    db.commit()
    db.refresh(n)
    return n


def _type_label(t: str) -> str:
    return {"POC": "POC", "DOCUMENTATION": "Document"}.get(t, t.title())


def patch_node(db: Session, node_id: str, data: schemas.NodePatch, actor: str) -> Node:
    n = get_or_404(db, Node, node_id, "Node")
    changes_old: dict = {}
    changes_new: dict = {}
    fields = data.model_dump(exclude_unset=True)

    # Position-only updates (dragging) are not worth an activity entry.
    if "position" in fields:
        pos = data.position
        n.position_x = pos.x if pos else None
        n.position_y = pos.y if pos else None
        fields.pop("position")

    for f in ("title", "description", "owner", "tags", "metadata"):
        if f in fields:
            attr = "meta" if f == "metadata" else f
            old = getattr(n, attr)
            if old != fields[f]:
                changes_old[f], changes_new[f] = old, fields[f]
                setattr(n, attr, fields[f])

    if "status" in fields and fields["status"] and fields["status"] != n.status:
        if n.type == NodeType.VERSION and n.version and not n.version.is_active and fields["status"] != NodeStatus.HISTORICAL:
            raise DomainError("Historical versions keep HISTORICAL status. Activate the version instead.", 409)
        log_activity(
            db, team_id=n.team_id, actor=actor, node=n,
            action="INITIATIVE_BLOCKED" if fields["status"] == NodeStatus.BLOCKED else "STATUS_CHANGED",
            old={"status": n.status}, new={"status": fields["status"]},
            description=f"{n.title} status {n.status.replace('_', ' ').lower()} → {fields['status'].replace('_', ' ').lower()}",
        )
        n.status = fields["status"]

    if any(k in fields for k in ("uri", "resource_type", "file_reference")):
        _set_resource(n, fields.get("resource_type"), fields.get("uri"), fields.get("file_reference"))
        changes_new["resource"] = {k: fields[k] for k in ("uri", "resource_type", "file_reference") if k in fields}

    if "archived" in fields and fields["archived"] is not None:
        _set_archived(db, n, bool(fields["archived"]), actor)

    if changes_new:
        log_activity(
            db, team_id=n.team_id, actor=actor, node=n, action="NODE_UPDATED",
            old=_jsonable(changes_old), new=_jsonable(changes_new),
            description=f"{n.title} updated ({', '.join(changes_new)})",
        )
    db.commit()
    db.refresh(n)
    return n


def _jsonable(d: dict) -> dict:
    return {k: (v.isoformat() if isinstance(v, datetime) else v) for k, v in d.items()}


def _set_archived(db: Session, n: Node, archived: bool, actor: str) -> None:
    if n.type == NodeType.TEAM:
        raise DomainError("The team root cannot be archived.", 409)
    if archived == (n.archived_at is not None):
        return
    n.archived_at = utcnow() if archived else None
    if n.type == NodeType.POC and n.initiative:
        n.initiative.is_active = not archived
    log_activity(
        db, team_id=n.team_id, actor=actor, node=n,
        action="NODE_ARCHIVED" if archived else "NODE_RESTORED",
        description=f"{n.title} {'archived' if archived else 'restored'}",
    )
    if n.type == NodeType.POC:
        record_snapshots(db, n.team_id, None)


def delete_node(db: Session, node_id: str, cascade_edges: bool, actor: str) -> dict:
    n = get_or_404(db, Node, node_id, "Node")
    if n.type == NodeType.TEAM:
        raise DomainError("The team root cannot be deleted.", 409)

    to_delete: list[Node] = [n]
    if n.type == NodeType.VERSION and n.version:
        if n.version.is_active:
            raise DomainError("The active version cannot be deleted. Activate another version first.", 409)
    if n.type == NodeType.POC and n.initiative:
        to_delete += [v.node for v in n.initiative.versions]

    ids = [x.id for x in to_delete]
    edges = list(db.scalars(select(Edge).where(or_(Edge.source_id.in_(ids), Edge.target_id.in_(ids)))))
    evidence_refs = list(db.scalars(select(Evidence).where(Evidence.resource_node_id.in_(ids))))
    if (edges or evidence_refs) and not cascade_edges:
        raise DomainError(
            f"“{n.title}” is still referenced by {len(edges)} relationship(s)"
            + (f" and {len(evidence_refs)} evidence record(s)" if evidence_refs else "")
            + ". Confirm to remove them with the node.",
            409,
            "has_dependents",
        )
    for e in edges:
        db.delete(e)
    for ev in evidence_refs:
        ev.resource_node_id = None  # keep the evidence (its URI); drop only the node link
    db.flush()

    if n.type == NodeType.POC and n.initiative:
        ini = n.initiative
        ini.active_version_id = None
        db.flush()
        for v in list(ini.versions):
            _delete_version_rows(db, v)
        db.delete(ini)
        db.flush()
    elif n.type == NodeType.VERSION and n.version:
        _delete_version_rows(db, n.version)

    log_activity(
        db, team_id=n.team_id, actor=actor, node=n, action="NODE_DELETED",
        old={"type": n.type, "title": n.title, "removed_edges": len(edges)},
        description=f"{_type_label(n.type)} “{n.title}” deleted ({len(edges)} relationship(s) removed)",
    )
    for x in to_delete:
        if x.resource:
            db.delete(x.resource)
        db.delete(x)
    db.flush()
    if n.type in (NodeType.POC, NodeType.VERSION):
        record_snapshots(db, n.team_id, None)
    db.commit()
    return {"deleted_nodes": ids, "deleted_edges": [e.id for e in edges]}


def _delete_version_rows(db: Session, v: PocVersion) -> None:
    for s in db.scalars(select(ProgressSnapshot).where(ProgressSnapshot.version_id == v.node_id)):
        db.delete(s)
    db.delete(v)
    db.flush()


# --- Edge mutations -------------------------------------------------------------------------


STRUCTURAL = {Relationship.HAS_VERSION, Relationship.VERSION_OF}


def _ancestors(db: Session, node_id: str) -> set[str]:
    """All hierarchical ancestors of node_id."""
    seen: set[str] = set()
    frontier = [node_id]
    rels = [r.value for r in HIERARCHICAL_RELATIONSHIPS]
    while frontier:
        parents = db.scalars(
            select(Edge.source_id).where(Edge.target_id.in_(frontier), Edge.relationship.in_(rels))
        ).all()
        frontier = [p for p in parents if p not in seen]
        seen.update(frontier)
    return seen


def _derived_chain(db: Session, node_id: str) -> set[str]:
    seen: set[str] = set()
    frontier = [node_id]
    while frontier:
        nxt = db.scalars(
            select(Edge.target_id).where(
                Edge.source_id.in_(frontier), Edge.relationship == Relationship.DERIVED_FROM
            )
        ).all()
        frontier = [x for x in nxt if x not in seen]
        seen.update(frontier)
    return seen


def _create_edge(
    db: Session, src: Node, tgt: Node, rel: Relationship, meta: dict, actor: str, log: bool = True
) -> Edge:
    if src.id == tgt.id:
        raise DomainError("A node cannot be related to itself.")
    exists = db.scalars(
        select(Edge).where(Edge.source_id == src.id, Edge.target_id == tgt.id, Edge.relationship == rel)
    ).first()
    if exists:
        raise DomainError("That relationship already exists.", 409, "duplicate_edge")
    if rel == Relationship.OWNS and src.type != NodeType.TEAM:
        raise DomainError("Only the team can OWN an initiative.")
    if rel in HIERARCHICAL_RELATIONSHIPS:
        if tgt.type == NodeType.TEAM:
            raise DomainError("The team root cannot be a child.")
        if tgt.id in _ancestors(db, src.id) or tgt.id == src.id:
            raise DomainError("This relationship would create a cycle in the hierarchy.", 409, "cycle")
    if rel == Relationship.DERIVED_FROM and src.id in _derived_chain(db, tgt.id):
        raise DomainError("This DERIVED_FROM relationship would create a cycle.", 409, "cycle")
    e = Edge(source_id=src.id, target_id=tgt.id, relationship=rel, meta=meta, created_by=actor)
    db.add(e)
    db.flush()
    if log:
        log_activity(
            db, team_id=src.team_id, actor=actor, node=src, action="RELATIONSHIP_CREATED",
            new={"edge_id": e.id, "relationship": rel, "target_id": tgt.id},
            description=f"{src.title} —{rel.replace('_', ' ').lower()}→ {tgt.title}",
        )
    return e


def create_edge(db: Session, data: schemas.EdgeCreate, actor: str) -> Edge:
    if data.relationship in STRUCTURAL:
        raise DomainError("Version relationships are managed by version creation.", 422)
    src = get_or_404(db, Node, data.source_id, "Source node")
    tgt = get_or_404(db, Node, data.target_id, "Target node")
    if src.team_id != tgt.team_id:
        raise DomainError("Nodes belong to different teams.")
    e = _create_edge(db, src, tgt, data.relationship, data.metadata, actor)
    db.commit()
    db.refresh(e)
    return e


def delete_edge(db: Session, edge_id: str, actor: str) -> None:
    e = get_or_404(db, Edge, edge_id, "Relationship")
    if e.relationship in STRUCTURAL:
        raise DomainError("Version relationships cannot be removed directly.", 409)
    src = db.get(Node, e.source_id)
    tgt = db.get(Node, e.target_id)
    if e.relationship == Relationship.OWNS:
        raise DomainError("Initiative ownership cannot be removed; archive or delete the initiative.", 409)
    log_activity(
        db, team_id=src.team_id, actor=actor, node=src, action="RELATIONSHIP_REMOVED",
        old={"edge_id": e.id, "relationship": e.relationship, "target_id": e.target_id},
        description=f"Removed {src.title} —{e.relationship.replace('_', ' ').lower()}→ {tgt.title if tgt else '?'}",
    )
    db.delete(e)
    db.commit()
