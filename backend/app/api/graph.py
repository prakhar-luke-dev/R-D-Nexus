from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app import schemas
from app.api.deps import actor
from app.db import get_db
from app.models import ActivityLog, Edge, Node
from app.services import graph as svc
from app.services.common import get_or_404

router = APIRouter(prefix="/api", tags=["graph"])


class RelationOut(BaseModel):
    edge: schemas.EdgeOut
    direction: str  # "out" (this node is the source) or "in"
    node: schemas.NodeOut


class NodeDetailOut(BaseModel):
    node: schemas.NodeOut
    relations: list[RelationOut]
    activity: list[schemas.ActivityOut]


@router.get("/graph", response_model=schemas.GraphOut)
def get_graph(include_archived: bool = False, db: Session = Depends(get_db)):
    return svc.build_graph(db, include_archived)


@router.get("/nodes", response_model=list[schemas.NodeOut])
def list_nodes(type: str | None = None, q: str | None = None, db: Session = Depends(get_db)):
    team = svc.get_team(db)
    ctx = svc.GraphContext(db, team.id)
    stmt = select(Node).where(Node.team_id == team.id, Node.archived_at.is_(None))
    if type:
        stmt = stmt.where(Node.type.in_(type.split(",")))
    if q:
        like = f"%{q.lower()}%"
        stmt = stmt.where(or_(Node.title.ilike(like), Node.description.ilike(like)))
    return [ctx.node_out(n) for n in db.scalars(stmt.order_by(Node.title))]


@router.get("/nodes/{node_id}", response_model=NodeDetailOut)
def get_node(node_id: str, db: Session = Depends(get_db)):
    n = get_or_404(db, Node, node_id, "Node")
    ctx = svc.GraphContext(db, n.team_id)
    edges, others = svc.neighbours(db, node_id)
    by_id = {o.id: o for o in others}
    relations = [
        RelationOut(
            edge=schemas.EdgeOut.model_validate(e),
            direction="out" if e.source_id == node_id else "in",
            node=ctx.node_out(by_id[e.target_id if e.source_id == node_id else e.source_id]),
        )
        for e in edges
    ]
    # Activity for the node; for a POC also include its versions' activity.
    ids = [node_id]
    if n.initiative:
        ids += [v.node_id for v in n.initiative.versions]
    acts = db.scalars(
        select(ActivityLog).where(ActivityLog.node_id.in_(ids)).order_by(ActivityLog.created_at.desc()).limit(40)
    ).all()
    return NodeDetailOut(
        node=ctx.node_out(n),
        relations=relations,
        activity=[schemas.ActivityOut.model_validate(a) for a in acts],
    )


@router.post("/nodes", response_model=schemas.NodeOut, status_code=201)
def create_node(data: schemas.NodeCreate, db: Session = Depends(get_db), who: str = Depends(actor)):
    n = svc.create_node(db, data, who)
    return svc.node_detail(db, n.id)


@router.patch("/nodes/{node_id}", response_model=schemas.NodeOut)
def patch_node(node_id: str, data: schemas.NodePatch, db: Session = Depends(get_db), who: str = Depends(actor)):
    svc.patch_node(db, node_id, data, who)
    return svc.node_detail(db, node_id)


@router.delete("/nodes/{node_id}")
def delete_node(node_id: str, cascade_edges: bool = False, db: Session = Depends(get_db),
                who: str = Depends(actor)):
    return svc.delete_node(db, node_id, cascade_edges, who)


@router.post("/edges", response_model=schemas.EdgeOut, status_code=201)
def create_edge(data: schemas.EdgeCreate, db: Session = Depends(get_db), who: str = Depends(actor)):
    return schemas.EdgeOut.model_validate(svc.create_edge(db, data, who))


@router.delete("/edges/{edge_id}", status_code=204)
def delete_edge(edge_id: str, db: Session = Depends(get_db), who: str = Depends(actor)):
    svc.delete_edge(db, edge_id, who)


@router.get("/edges", response_model=list[schemas.EdgeOut])
def list_edges(db: Session = Depends(get_db)):
    return [schemas.EdgeOut.model_validate(e) for e in db.scalars(select(Edge))]
