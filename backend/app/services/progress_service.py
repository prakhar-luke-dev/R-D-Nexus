"""Bridges the DB and the pure progress engine."""

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models import Deliverable, Node, PocInitiative, PocVersion, ProgressSnapshot
from app.services import progress as engine


def _inputs(deliverables: list[Deliverable]) -> list[engine.DeliverableInput]:
    return [
        engine.DeliverableInput(
            id=d.id,
            category=d.category,
            weight=d.weight,
            state=d.state,
            not_applicable=d.is_not_applicable,
        )
        for d in deliverables
    ]


def version_progress(version: PocVersion) -> engine.VersionProgress:
    return engine.version_progress(_inputs(version.deliverables))


def load_initiatives(db: Session, team_id: str) -> list[PocInitiative]:
    return list(
        db.scalars(
            select(PocInitiative)
            .join(Node, Node.id == PocInitiative.node_id)
            .where(Node.team_id == team_id)
            .options(
                selectinload(PocInitiative.node),
                selectinload(PocInitiative.versions).selectinload(PocVersion.deliverables),
            )
            # Always reflect flushed state, even for objects already in the identity map.
            .execution_options(populate_existing=True)
        )
    )


def all_version_progress(initiatives: list[PocInitiative]) -> dict[str, engine.VersionProgress]:
    return {v.node_id: version_progress(v) for ini in initiatives for v in ini.versions}


def team_progress_from(
    initiatives: list[PocInitiative], vp: dict[str, engine.VersionProgress]
) -> engine.TeamProgress:
    summaries = [
        engine.InitiativeSummary(
            id=ini.node_id,
            importance=ini.importance_weight,
            # Archived initiatives never contribute.
            is_active=ini.is_active and ini.node.archived_at is None,
            active_version_id=ini.active_version_id,
            versions=[
                engine.VersionSummary(
                    id=v.node_id,
                    is_active=v.is_active,
                    code=vp[v.node_id].code,
                    validation=vp[v.node_id].validation,
                )
                for v in ini.versions
            ],
        )
        for ini in initiatives
    ]
    return engine.team_progress(summaries)


def team_progress(db: Session, team_id: str) -> engine.TeamProgress:
    inis = load_initiatives(db, team_id)
    return team_progress_from(inis, all_version_progress(inis))


def record_snapshots(db: Session, team_id: str, version: PocVersion | None) -> None:
    """Write a snapshot for the changed version (if any) and for the team."""
    db.flush()
    if version is not None:
        db.refresh(version, attribute_names=["deliverables"])
        p = version_progress(version)
        db.add(
            ProgressSnapshot(
                team_id=team_id,
                version_id=version.node_id,
                code_score=p.code,
                validation_score=p.validation,
                overall_score=p.overall,
            )
        )
    t = team_progress(db, team_id)
    db.add(
        ProgressSnapshot(
            team_id=team_id,
            version_id=None,
            code_score=t.code,
            validation_score=t.validation,
            overall_score=t.overall,
        )
    )
