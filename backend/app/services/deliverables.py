"""Deliverable and evidence business rules."""

from dataclasses import dataclass

from sqlalchemy.orm import Session

from app.enums import CompletionState, EvidenceType
from app.models import Deliverable, Evidence, Node, PocVersion
from app.services.common import DomainError, get_or_404, log_activity
from app.services.progress_service import record_snapshots, version_progress



@dataclass
class DeliverablePatch:
    state: CompletionState | None = None
    is_not_applicable: bool | None = None
    not_applicable_reason: str | None = None
    is_blocked: bool | None = None
    blocker_reason: str | None = None
    verification_exception: bool | None = None
    verification_exception_reason: str | None = None
    weight: float | None = None
    scope_change_reason: str | None = None


def _version_node(db: Session, d: Deliverable) -> tuple[PocVersion, Node]:
    v = get_or_404(db, PocVersion, d.version_id, "Version")
    return v, v.node


def _has_evidence(d: Deliverable) -> bool:
    return len(d.evidence) > 0


def _require(text: str | None, message: str) -> str:
    if not text or not text.strip():
        raise DomainError(message)
    return text.strip()


def update_deliverable(db: Session, deliverable_id: str, patch: DeliverablePatch, actor: str) -> Deliverable:
    d = get_or_404(db, Deliverable, deliverable_id, "Deliverable")
    version, vnode = _version_node(db, d)
    team_id = vnode.team_id
    before = version_progress(version)
    label = f"{d.title} ({vnode.title})"

    if version.superseded_at is not None or not version.is_active:
        # Historical versions stay accessible, but their record is frozen.
        raise DomainError("This version is historical; its deliverables are read-only.", 409, "historical")

    # --- Scope: N/A ------------------------------------------------------------------------
    if patch.is_not_applicable is not None and patch.is_not_applicable != d.is_not_applicable:
        reason = _require(patch.not_applicable_reason or patch.scope_change_reason,
                          "A reason is required to change the deliverable's scope.")
        if patch.is_not_applicable:
            if d.ever_started or d.state != CompletionState.NOT_STARTED or _has_evidence(d):
                raise DomainError(
                    "A deliverable can only be marked N/A before work on it begins.", 409, "na_after_start"
                )
            d.is_not_applicable = True
            d.not_applicable_reason = reason
        else:
            d.is_not_applicable = False
            d.not_applicable_reason = None
        log_activity(
            db, team_id=team_id, actor=actor, node=vnode, action="SCOPE_CHANGED",
            old={"deliverable_id": d.id, "not_applicable": not d.is_not_applicable},
            new={"deliverable_id": d.id, "not_applicable": d.is_not_applicable, "reason": reason},
            description=f"{'Marked N/A' if d.is_not_applicable else 'Restored to scope'}: {label}. Reason: {reason}",
        )

    # --- Weight (also a scope change) ------------------------------------------------------
    if patch.weight is not None and patch.weight != d.weight:
        if patch.weight <= 0:
            raise DomainError("Deliverable weight must be positive.")
        reason = _require(patch.scope_change_reason, "A reason is required to change a deliverable's weight.")
        old_w = d.weight
        d.weight = patch.weight
        log_activity(
            db, team_id=team_id, actor=actor, node=vnode, action="SCOPE_CHANGED",
            old={"deliverable_id": d.id, "weight": old_w},
            new={"deliverable_id": d.id, "weight": d.weight, "reason": reason},
            description=f"Weight of {label} changed {old_w:g} → {d.weight:g}. Reason: {reason}",
        )

    # --- Verification exception ------------------------------------------------------------
    if patch.verification_exception is not None and patch.verification_exception != d.verification_exception:
        if patch.verification_exception:
            d.verification_exception_reason = _require(
                patch.verification_exception_reason, "A reason is required for a verification exception."
            )
            d.verification_exception = True
        else:
            if d.state == CompletionState.VERIFIED and not _has_evidence(d):
                raise DomainError("Cannot remove the exception while the deliverable is Verified without evidence.", 409)
            d.verification_exception = False
            d.verification_exception_reason = None
        log_activity(
            db, team_id=team_id, actor=actor, node=vnode, action="VERIFICATION_EXCEPTION",
            new={"deliverable_id": d.id, "exception": d.verification_exception,
                 "reason": d.verification_exception_reason},
            description=f"Verification exception {'granted' if d.verification_exception else 'removed'} for {label}",
        )

    # --- State -----------------------------------------------------------------------------
    if patch.state is not None and patch.state != d.state:
        new_state = CompletionState(patch.state)
        if d.is_not_applicable:
            raise DomainError("This deliverable is N/A. Restore it to scope before updating its state.", 409)
        if new_state == CompletionState.VERIFIED and not _has_evidence(d) and not d.verification_exception:
            raise DomainError(
                "Verified requires supporting evidence. Attach evidence first, or grant a verification exception.",
                422, "evidence_required",
            )
        old_state = d.state
        d.state = new_state
        if new_state != CompletionState.NOT_STARTED:
            d.ever_started = True
        log_activity(
            db, team_id=team_id, actor=actor, node=vnode, action="DELIVERABLE_UPDATED",
            old={"deliverable_id": d.id, "state": old_state},
            new={"deliverable_id": d.id, "state": new_state},
            description=f"{label}: {_pretty(old_state)} → {_pretty(new_state)}",
        )

    # --- Blocked (status, never a score) ---------------------------------------------------
    if patch.is_blocked is not None and patch.is_blocked != d.is_blocked:
        if patch.is_blocked:
            d.blocker_reason = _require(patch.blocker_reason, "Describe the blocker.")
            d.is_blocked = True
        else:
            d.is_blocked = False
            d.blocker_reason = None
        log_activity(
            db, team_id=team_id, actor=actor, node=vnode,
            action="BLOCKED" if d.is_blocked else "UNBLOCKED",
            new={"deliverable_id": d.id, "reason": d.blocker_reason},
            description=f"{label} {'blocked: ' + d.blocker_reason if d.is_blocked else 'unblocked'}",
        )
    elif patch.is_blocked and patch.blocker_reason and patch.blocker_reason != d.blocker_reason:
        d.blocker_reason = patch.blocker_reason.strip()

    d.updated_by = actor
    db.flush()
    db.refresh(version, attribute_names=["deliverables"])
    after = version_progress(version)
    if (before.code, before.validation) != (after.code, after.validation):
        log_activity(
            db, team_id=team_id, actor=actor, node=vnode, action="PROGRESS_CHANGED",
            old={"code": before.code, "validation": before.validation, "overall": before.overall},
            new={"code": after.code, "validation": after.validation, "overall": after.overall},
            description=f"{vnode.title} progress {_pct(before.overall)} → {_pct(after.overall)}",
        )
    record_snapshots(db, team_id, version)
    db.commit()
    db.refresh(d)
    return d


def _pretty(state: str) -> str:
    return state.replace("_", " ").title()


def _pct(v: float | None) -> str:
    return "—" if v is None else f"{v:.1f}%"


# --- Evidence ----------------------------------------------------------------------------------


def add_evidence(
    db: Session,
    deliverable_id: str,
    *,
    type: EvidenceType,
    title: str,
    uri: str | None,
    description: str,
    resource_node_id: str | None,
    actor: str,
) -> Evidence:
    d = get_or_404(db, Deliverable, deliverable_id, "Deliverable")
    version, vnode = _version_node(db, d)
    if not version.is_active:
        raise DomainError("This version is historical; its evidence is read-only.", 409, "historical")
    if not (uri and uri.strip()) and not resource_node_id:
        raise DomainError("Evidence needs a URI or a linked resource.")
    if resource_node_id:
        res = get_or_404(db, Node, resource_node_id, "Resource node")
        uri = uri or (res.resource.uri if res.resource else None)
    ev = Evidence(
        deliverable_id=d.id,
        type=type,
        title=_require(title, "Evidence title is required."),
        uri=uri,
        description=description or "",
        resource_node_id=resource_node_id,
        created_by=actor,
    )
    db.add(ev)
    log_activity(
        db, team_id=vnode.team_id, actor=actor, node=vnode, action="EVIDENCE_ATTACHED",
        new={"deliverable_id": d.id, "title": ev.title, "uri": uri},
        description=f"Evidence “{ev.title}” attached to {d.title} ({vnode.title})",
    )
    db.commit()
    db.refresh(ev)
    return ev


def delete_evidence(db: Session, evidence_id: str, actor: str) -> None:
    ev = get_or_404(db, Evidence, evidence_id, "Evidence")
    d = ev.deliverable
    version, vnode = _version_node(db, d)
    if not version.is_active:
        raise DomainError("This version is historical; its evidence is read-only.", 409, "historical")
    if d.state == CompletionState.VERIFIED and len(d.evidence) <= 1 and not d.verification_exception:
        raise DomainError(
            "This is the only evidence for a Verified deliverable. Lower its state first.", 409, "evidence_required"
        )
    log_activity(
        db, team_id=vnode.team_id, actor=actor, node=vnode, action="EVIDENCE_REMOVED",
        old={"deliverable_id": d.id, "title": ev.title, "uri": ev.uri},
        description=f"Evidence “{ev.title}” removed from {d.title} ({vnode.title})",
    )
    db.delete(ev)
    db.commit()


def reuse_evidence(db: Session, evidence_id: str, target_deliverable_id: str, actor: str) -> Evidence:
    """Explicitly accept evidence from an older version for a deliverable of a newer one."""
    src = get_or_404(db, Evidence, evidence_id, "Evidence")
    target = get_or_404(db, Deliverable, target_deliverable_id, "Target deliverable")
    src_version, src_node = _version_node(db, src.deliverable)
    tgt_version, tgt_node = _version_node(db, target)
    if src_version.initiative_id != tgt_version.initiative_id:
        raise DomainError("Evidence can only be reused within the same initiative.")
    if src_version.node_id == tgt_version.node_id:
        raise DomainError("Evidence already belongs to this version.")
    if not tgt_version.is_active:
        raise DomainError("Evidence can only be reused into the active version.", 409)
    if any(e.reused_from_evidence_id == src.id for e in target.evidence):
        raise DomainError("This evidence has already been accepted for that deliverable.", 409)
    ev = Evidence(
        deliverable_id=target.id,
        type=src.type,
        title=src.title,
        uri=src.uri,
        description=src.description,
        resource_node_id=src.resource_node_id,
        reused_from_evidence_id=src.id,
        accepted_by=actor,
        created_by=actor,
        meta={"reused_from_version": src_version.version_label},
    )
    db.add(ev)
    log_activity(
        db, team_id=tgt_node.team_id, actor=actor, node=tgt_node, action="EVIDENCE_REUSED",
        new={"deliverable_id": target.id, "source_evidence_id": src.id, "from_version": src_node.title},
        description=f"Accepted evidence “{src.title}” from {src_node.title} for {target.title}",
    )
    db.commit()
    db.refresh(ev)
    return ev
