from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app import schemas
from app.api.deps import actor
from app.db import get_db
from app.enums import COMPLETION_SCORES, CompletionState, NodeType
from app.models import Deliverable, Evidence, PocVersion
from app.services import deliverables as dsvc
from app.services import versions as vsvc
from app.services.common import get_or_404
from app.services.graph import GraphContext, get_team, node_detail, progress_out
from app.services.progress_service import version_progress

router = APIRouter(prefix="/api", tags=["initiatives"])


# --- Initiatives ----------------------------------------------------------------------------


@router.get("/pocs", response_model=list[schemas.PocSummaryOut])
def list_pocs(db: Session = Depends(get_db)):
    return vsvc.poc_summaries(db, get_team(db).id)


@router.post("/pocs", response_model=schemas.NodeOut, status_code=201)
def create_poc(data: schemas.NodeCreate, db: Session = Depends(get_db), who: str = Depends(actor)):
    data = data.model_copy(update={"type": NodeType.POC})
    n = vsvc.create_poc(db, get_team(db), data, who)
    return node_detail(db, n.id)


@router.get("/pocs/{poc_id}", response_model=schemas.PocSummaryOut)
def get_poc(poc_id: str, db: Session = Depends(get_db)):
    ini = vsvc.get_initiative(db, poc_id)
    return next(p for p in vsvc.poc_summaries(db, ini.node.team_id) if p.id == poc_id)


@router.patch("/pocs/{poc_id}", response_model=schemas.PocSummaryOut)
def patch_poc(poc_id: str, data: schemas.PocPatch, db: Session = Depends(get_db), who: str = Depends(actor)):
    vsvc.patch_poc(db, poc_id, data, who)
    return get_poc(poc_id, db)


@router.get("/pocs/{poc_id}/versions", response_model=list[schemas.VersionOut])
def list_versions(poc_id: str, db: Session = Depends(get_db)):
    return vsvc.list_versions(db, poc_id)


@router.post("/pocs/{poc_id}/versions", response_model=schemas.VersionOut, status_code=201)
def create_version(poc_id: str, data: schemas.VersionCreate, db: Session = Depends(get_db),
                   who: str = Depends(actor)):
    v = vsvc.create_version(db, poc_id, data, who)
    ctx = GraphContext(db, v.node.team_id)
    return vsvc.version_out(ctx, ctx.versions[v.node_id], db)


@router.post("/versions/{version_id}/activate", response_model=schemas.VersionOut)
def activate_version(version_id: str, db: Session = Depends(get_db), who: str = Depends(actor)):
    v = vsvc.activate_version(db, version_id, who)
    ctx = GraphContext(db, v.node.team_id)
    return vsvc.version_out(ctx, ctx.versions[v.node_id], db)


# --- Progress -------------------------------------------------------------------------------


def _version_progress_out(v: PocVersion) -> schemas.VersionProgressOut:
    p = version_progress(v)
    titles = {d.id: d.title for d in v.deliverables}

    def lines(cat):
        return [
            schemas.LineItemOut(
                deliverable_id=li.id, title=titles.get(li.id, ""), weight=li.weight,
                normalized_weight=li.normalized_weight, score=li.score, contribution=li.contribution,
            )
            for li in cat.items
        ]

    return schemas.VersionProgressOut(
        node_id=v.node_id,
        code_progress=p.code,
        validation_progress=p.validation,
        overall_progress=p.overall,
        status=v.node.status,
        last_updated=max([v.node.updated_at] + [d.updated_at for d in v.deliverables]),
        code_breakdown=lines(p.code_breakdown),
        validation_breakdown=lines(p.validation_breakdown),
        blockers=[
            schemas.BlockerOut(
                deliverable_id=d.id, title=d.title, category=d.category, reason=d.blocker_reason,
                version_id=v.node_id, version_title=v.node.title,
            )
            for d in v.deliverables
            if d.is_blocked
        ],
    )


@router.get("/versions/{version_id}/progress", response_model=schemas.VersionProgressOut)
def get_version_progress(version_id: str, db: Session = Depends(get_db)):
    return _version_progress_out(get_or_404(db, PocVersion, version_id, "Version"))


@router.get("/pocs/{poc_id}/progress", response_model=schemas.VersionProgressOut | None)
def get_poc_progress(poc_id: str, db: Session = Depends(get_db)):
    ini = vsvc.get_initiative(db, poc_id)
    if not ini.active_version_id:
        return None
    return _version_progress_out(get_or_404(db, PocVersion, ini.active_version_id, "Version"))


@router.get("/team/progress", response_model=schemas.TeamProgressOut)
def get_team_progress(db: Session = Depends(get_db)):
    return GraphContext(db, get_team(db).id).team_out()


# --- Deliverables & evidence ----------------------------------------------------------------


def deliverable_out(d: Deliverable) -> schemas.DeliverableOut:
    return schemas.DeliverableOut.model_validate(
        {
            **{c: getattr(d, c) for c in schemas.DeliverableOut.model_fields if c not in ("score", "evidence")},
            "score": COMPLETION_SCORES[CompletionState(d.state)],
            "evidence": [schemas.EvidenceOut.model_validate(e) for e in d.evidence],
        }
    )


@router.get("/versions/{version_id}/deliverables", response_model=schemas.DeliverablesOut)
def list_deliverables(version_id: str, db: Session = Depends(get_db)):
    v = get_or_404(db, PocVersion, version_id, "Version")
    return schemas.DeliverablesOut(
        version_id=v.node_id,
        is_active=v.is_active,
        progress=progress_out(version_progress(v)),
        deliverables=[deliverable_out(d) for d in v.deliverables],
    )


@router.patch("/deliverables/{deliverable_id}", response_model=schemas.DeliverableOut)
def patch_deliverable(deliverable_id: str, data: schemas.DeliverablePatchIn, db: Session = Depends(get_db),
                      who: str = Depends(actor)):
    d = dsvc.update_deliverable(db, deliverable_id, dsvc.DeliverablePatch(**data.model_dump()), who)
    return deliverable_out(d)


@router.get("/deliverables/{deliverable_id}/evidence", response_model=list[schemas.EvidenceOut])
def list_evidence(deliverable_id: str, db: Session = Depends(get_db)):
    d = get_or_404(db, Deliverable, deliverable_id, "Deliverable")
    return [schemas.EvidenceOut.model_validate(e) for e in d.evidence]


@router.post("/deliverables/{deliverable_id}/evidence", response_model=schemas.EvidenceOut, status_code=201)
def add_evidence(deliverable_id: str, data: schemas.EvidenceCreate, db: Session = Depends(get_db),
                 who: str = Depends(actor)):
    ev = dsvc.add_evidence(db, deliverable_id, actor=who, **data.model_dump())
    return schemas.EvidenceOut.model_validate(ev)


@router.delete("/evidence/{evidence_id}", status_code=204)
def delete_evidence(evidence_id: str, db: Session = Depends(get_db), who: str = Depends(actor)):
    dsvc.delete_evidence(db, evidence_id, who)


@router.post("/evidence/{evidence_id}/reuse", response_model=schemas.EvidenceOut, status_code=201)
def reuse_evidence(evidence_id: str, data: schemas.EvidenceReuse, db: Session = Depends(get_db),
                   who: str = Depends(actor)):
    ev = dsvc.reuse_evidence(db, evidence_id, data.target_deliverable_id, who)
    return schemas.EvidenceOut.model_validate(ev)


@router.get("/evidence/{evidence_id}", response_model=schemas.EvidenceOut)
def get_evidence(evidence_id: str, db: Session = Depends(get_db)):
    return schemas.EvidenceOut.model_validate(get_or_404(db, Evidence, evidence_id, "Evidence"))
