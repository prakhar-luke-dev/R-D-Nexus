from collections import Counter
from datetime import UTC

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import schemas
from app.db import get_db
from app.enums import NodeStatus, NodeType, ResearchOutcome
from app.models import ActivityLog, Node, ProgressSnapshot
from app.services.graph import GraphContext, get_team
from app.services.versions import poc_summaries

router = APIRouter(prefix="/api", tags=["activity"])


@router.get("/activity", response_model=list[schemas.ActivityOut])
def list_activity(
    node_id: str | None = None,
    action: str | None = None,
    limit: int = Query(default=100, le=500),
    db: Session = Depends(get_db),
):
    team = get_team(db)
    stmt = select(ActivityLog).where(ActivityLog.team_id == team.id)
    if node_id:
        stmt = stmt.where(ActivityLog.node_id == node_id)
    if action:
        stmt = stmt.where(ActivityLog.action.in_(action.split(",")))
    stmt = stmt.order_by(ActivityLog.created_at.desc()).limit(limit)
    return [schemas.ActivityOut.model_validate(a) for a in db.scalars(stmt)]


@router.get("/snapshots", response_model=list[schemas.SnapshotOut])
def list_snapshots(version_id: str | None = None, team: bool = False, db: Session = Depends(get_db)):
    t = get_team(db)
    stmt = select(ProgressSnapshot).where(ProgressSnapshot.team_id == t.id)
    if team:
        stmt = stmt.where(ProgressSnapshot.version_id.is_(None))
    elif version_id:
        stmt = stmt.where(ProgressSnapshot.version_id == version_id)
    return [schemas.SnapshotOut.model_validate(s) for s in db.scalars(stmt.order_by(ProgressSnapshot.calculated_at))]


class TrendPoint(BaseModel):
    date: str
    code_progress: float | None
    validation_progress: float | None
    overall_progress: float | None


class OverviewOut(BaseModel):
    team_progress: schemas.TeamProgressOut
    active_poc_count: int
    completed_poc_count: int
    blocked: list[schemas.PocSummaryOut]
    recently_updated: list[schemas.PocSummaryOut]
    outcomes: dict[str, int]
    trend: list[TrendPoint]
    latest_experiments: list[schemas.NodeOut]
    recent_activity: list[schemas.ActivityOut]


@router.get("/overview", response_model=OverviewOut)
def overview(db: Session = Depends(get_db)):
    team = get_team(db)
    ctx = GraphContext(db, team.id)
    pocs = [p for p in poc_summaries(db, team.id) if p.archived_at is None]
    active = [p for p in pocs if p.is_active]
    done = {ResearchOutcome.VALIDATED, ResearchOutcome.READY_FOR_PRODUCTION, ResearchOutcome.REJECTED}
    completed = [p for p in pocs if p.status == NodeStatus.COMPLETED or p.research_outcome in done]
    blocked = [p for p in pocs if p.blocked_count > 0 or p.status == NodeStatus.BLOCKED]

    # Trend: the last team snapshot of each day.
    snaps = db.scalars(
        select(ProgressSnapshot)
        .where(ProgressSnapshot.team_id == team.id, ProgressSnapshot.version_id.is_(None))
        .order_by(ProgressSnapshot.calculated_at)
    ).all()
    per_day: dict[str, ProgressSnapshot] = {}
    for s in snaps:
        ts = s.calculated_at if s.calculated_at.tzinfo else s.calculated_at.replace(tzinfo=UTC)
        per_day[ts.date().isoformat()] = s
    trend = [
        TrendPoint(date=d, code_progress=s.code_score, validation_progress=s.validation_score,
                   overall_progress=s.overall_score)
        for d, s in sorted(per_day.items())
    ]
    exps = db.scalars(
        select(Node)
        .where(Node.team_id == team.id, Node.type == NodeType.EXPERIMENT, Node.archived_at.is_(None))
        .order_by(Node.updated_at.desc())
        .limit(5)
    ).all()
    acts = db.scalars(
        select(ActivityLog).where(ActivityLog.team_id == team.id).order_by(ActivityLog.created_at.desc()).limit(8)
    ).all()
    return OverviewOut(
        team_progress=ctx.team_out(),
        active_poc_count=len(active),
        completed_poc_count=len(completed),
        blocked=blocked,
        recently_updated=sorted(pocs, key=lambda p: p.updated_at, reverse=True)[:5],
        outcomes=dict(Counter(p.research_outcome for p in pocs)),
        trend=trend,
        latest_experiments=[ctx.node_out(n) for n in exps],
        recent_activity=[schemas.ActivityOut.model_validate(a) for a in acts],
    )
