"""Research, experiments, findings and the resource library. These are thin typed views over graph nodes."""

import re
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy import or_, select
from sqlalchemy.orm import Session, selectinload

from app import schemas
from app.api.deps import actor
from app.config import settings
from app.db import get_db
from app.enums import RESOURCE_NODE_TYPES, NodeType
from app.models import Edge, Node
from app.services import graph as svc
from app.services.common import DomainError, NotFound, get_or_404

router = APIRouter(prefix="/api", tags=["knowledge"])

MAX_UPLOAD_BYTES = 25 * 1024 * 1024


class RelatedRef(BaseModel):
    id: str
    title: str
    type: str
    relationship: str
    direction: str


class KnowledgeItemOut(BaseModel):
    node: schemas.NodeOut
    related: list[RelatedRef]


def _typed_list(db: Session, types: list[str], q: str | None = None) -> list[KnowledgeItemOut]:
    team = svc.get_team(db)
    ctx = svc.GraphContext(db, team.id)
    stmt = (
        select(Node)
        .where(Node.team_id == team.id, Node.type.in_(types), Node.archived_at.is_(None))
        .options(selectinload(Node.resource))
        .order_by(Node.updated_at.desc())
    )
    if q:
        like = f"%{q}%"
        stmt = stmt.where(or_(Node.title.ilike(like), Node.description.ilike(like)))
    nodes = list(db.scalars(stmt))
    ids = [n.id for n in nodes]
    edges = list(db.scalars(select(Edge).where(or_(Edge.source_id.in_(ids), Edge.target_id.in_(ids)))))
    other_ids = {e.source_id for e in edges} | {e.target_id for e in edges}
    others = {o.id: o for o in db.scalars(select(Node).where(Node.id.in_(other_ids)))}
    out = []
    for n in nodes:
        rel = []
        for e in edges:
            if e.source_id == n.id or e.target_id == n.id:
                oid = e.target_id if e.source_id == n.id else e.source_id
                o = others.get(oid)
                if o is not None and o.archived_at is None:
                    rel.append(RelatedRef(id=o.id, title=o.title, type=o.type, relationship=e.relationship,
                                          direction="out" if e.source_id == n.id else "in"))
        out.append(KnowledgeItemOut(node=ctx.node_out(n), related=rel))
    return out


def _create_typed(db: Session, data: schemas.NodeCreate, type_: NodeType, who: str) -> schemas.NodeOut:
    n = svc.create_node(db, data.model_copy(update={"type": type_}), who)
    return svc.node_detail(db, n.id)


def _patch_typed(db: Session, node_id: str, data: schemas.NodePatch, types: set[str], who: str):
    n = get_or_404(db, Node, node_id, "Node")
    if n.type not in types:
        raise NotFound("Node of that type")
    svc.patch_node(db, node_id, data, who)
    return svc.node_detail(db, node_id)


# Research
@router.get("/research", response_model=list[KnowledgeItemOut])
def list_research(q: str | None = None, db: Session = Depends(get_db)):
    return _typed_list(db, [NodeType.RESEARCH], q)


@router.post("/research", response_model=schemas.NodeOut, status_code=201)
def create_research(data: schemas.NodeCreate, db: Session = Depends(get_db), who: str = Depends(actor)):
    return _create_typed(db, data, NodeType.RESEARCH, who)


@router.get("/research/{node_id}", response_model=KnowledgeItemOut)
def get_research(node_id: str, db: Session = Depends(get_db)):
    items = [i for i in _typed_list(db, [NodeType.RESEARCH]) if i.node.id == node_id]
    if not items:
        raise NotFound("Research")
    return items[0]


@router.patch("/research/{node_id}", response_model=schemas.NodeOut)
def patch_research(node_id: str, data: schemas.NodePatch, db: Session = Depends(get_db), who: str = Depends(actor)):
    return _patch_typed(db, node_id, data, {NodeType.RESEARCH}, who)


# Experiments
@router.get("/experiments", response_model=list[KnowledgeItemOut])
def list_experiments(q: str | None = None, db: Session = Depends(get_db)):
    return _typed_list(db, [NodeType.EXPERIMENT], q)


@router.post("/experiments", response_model=schemas.NodeOut, status_code=201)
def create_experiment(data: schemas.NodeCreate, db: Session = Depends(get_db), who: str = Depends(actor)):
    return _create_typed(db, data, NodeType.EXPERIMENT, who)


@router.get("/experiments/{node_id}", response_model=KnowledgeItemOut)
def get_experiment(node_id: str, db: Session = Depends(get_db)):
    items = [i for i in _typed_list(db, [NodeType.EXPERIMENT]) if i.node.id == node_id]
    if not items:
        raise NotFound("Experiment")
    return items[0]


@router.patch("/experiments/{node_id}", response_model=schemas.NodeOut)
def patch_experiment(node_id: str, data: schemas.NodePatch, db: Session = Depends(get_db),
                     who: str = Depends(actor)):
    return _patch_typed(db, node_id, data, {NodeType.EXPERIMENT}, who)


# Library: canonical resources + findings + research notes
LIBRARY_TYPES = [*sorted(RESOURCE_NODE_TYPES), NodeType.FINDING, NodeType.RESEARCH]


@router.get("/library", response_model=list[KnowledgeItemOut])
def list_library(q: str | None = None, type: str | None = None, db: Session = Depends(get_db)):
    types = type.split(",") if type else LIBRARY_TYPES
    return _typed_list(db, types, q)


# Uploads
_SAFE = re.compile(r"[^A-Za-z0-9._-]+")


@router.post("/uploads", response_model=schemas.UploadOut, status_code=201)
async def upload(file: UploadFile = File(...)):
    settings.upload_dir.mkdir(parents=True, exist_ok=True)
    data = await file.read()
    if len(data) > MAX_UPLOAD_BYTES:
        raise DomainError("File exceeds the 25 MB limit.", 413)
    name = _SAFE.sub("_", Path(file.filename or "upload").name)[-120:]
    ref = f"{uuid.uuid4().hex[:10]}_{name}"
    (settings.upload_dir / ref).write_bytes(data)
    return schemas.UploadOut(file_reference=ref, url=f"/api/files/{ref}", filename=name, size=len(data))


@router.get("/files/{ref}")
def get_file(ref: str):
    path = (settings.upload_dir / ref).resolve()
    if path.parent != settings.upload_dir.resolve() or not path.is_file():
        raise NotFound("File")
    return FileResponse(path, filename=ref.split("_", 1)[-1])
