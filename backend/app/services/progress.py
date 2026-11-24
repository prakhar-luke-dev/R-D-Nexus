"""Pure progress engine with no DB access. It is the single source of truth for every progress number.

All public results are percentages in the range 0-100, rounded to 2 decimals. A value is None when
nothing applicable exists to measure, for example when every deliverable in a category is N/A.
"""

from collections.abc import Iterable, Sequence
from dataclasses import dataclass, field
from decimal import ROUND_HALF_UP, Decimal

from app.config import settings
from app.enums import COMPLETION_SCORES, CompletionState, DeliverableCategory


@dataclass(frozen=True)
class DeliverableInput:
    category: DeliverableCategory | str
    weight: float
    state: CompletionState | str
    not_applicable: bool = False
    id: str | None = None


@dataclass(frozen=True)
class LineItem:
    id: str | None
    weight: float
    normalized_weight: float  # share of the applicable total, in percent
    score: float  # 0..1
    contribution: float  # percentage points contributed to the category progress


@dataclass(frozen=True)
class CategoryResult:
    progress: float | None
    applicable_weight: float
    items: list[LineItem] = field(default_factory=list)


@dataclass(frozen=True)
class VersionProgress:
    code: float | None
    validation: float | None
    overall: float | None
    code_breakdown: CategoryResult
    validation_breakdown: CategoryResult


def _round(v: float | None) -> float | None:
    """Half-up rounding to 2 decimals (55.625 → 55.63), not banker's rounding."""
    if v is None:
        return None
    return float(Decimal(repr(v)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def state_score(state: CompletionState | str) -> float:
    return COMPLETION_SCORES[CompletionState(state)]


def category_progress(items: Iterable[DeliverableInput]) -> CategoryResult:
    """Σ(weight × score) / Σ(applicable weights). N/A items are excluded, which normalizes the rest."""
    applicable = [d for d in items if not d.not_applicable]
    total = sum(d.weight for d in applicable)
    if total <= 0:
        return CategoryResult(progress=None, applicable_weight=0.0, items=[])
    lines = []
    acc = 0.0
    for d in applicable:
        s = state_score(d.state)
        contribution = d.weight * s / total * 100
        acc += contribution
        lines.append(
            LineItem(
                id=d.id,
                weight=d.weight,
                normalized_weight=round(d.weight / total * 100, 4),
                score=s,
                contribution=round(contribution, 4),
            )
        )
    return CategoryResult(progress=_round(acc), applicable_weight=total, items=lines)


def overall_progress(
    code: float | None,
    validation: float | None,
    code_weight: float | None = None,
    validation_weight: float | None = None,
) -> float | None:
    """Weighted blend of the two categories (50/50 by default). A missing category is excluded."""
    wc = settings.code_weight if code_weight is None else code_weight
    wv = settings.validation_weight if validation_weight is None else validation_weight
    parts = [(v, w) for v, w in ((code, wc), (validation, wv)) if v is not None]
    if not parts:
        return None
    wsum = sum(w for _, w in parts)
    return _round(sum(v * w for v, w in parts) / wsum)


def version_progress(deliverables: Sequence[DeliverableInput]) -> VersionProgress:
    code = category_progress(d for d in deliverables if d.category == DeliverableCategory.CODE)
    val = category_progress(d for d in deliverables if d.category == DeliverableCategory.VALIDATION)
    return VersionProgress(
        code=code.progress,
        validation=val.progress,
        overall=overall_progress(code.progress, val.progress),
        code_breakdown=code,
        validation_breakdown=val,
    )


# --- Team aggregation -----------------------------------------------------------------------


@dataclass(frozen=True)
class VersionSummary:
    id: str
    is_active: bool
    code: float | None
    validation: float | None


@dataclass(frozen=True)
class InitiativeSummary:
    id: str
    importance: float
    is_active: bool
    active_version_id: str | None
    versions: Sequence[VersionSummary]


def select_active_version(initiative: InitiativeSummary) -> VersionSummary | None:
    """The initiative's progress is its latest active version. Historical versions never count."""
    if initiative.active_version_id:
        for v in initiative.versions:
            if v.id == initiative.active_version_id and v.is_active:
                return v
    return None


@dataclass(frozen=True)
class TeamContribution:
    initiative_id: str
    version_id: str
    importance: float
    code: float | None
    validation: float | None


@dataclass(frozen=True)
class TeamProgress:
    code: float | None
    validation: float | None
    overall: float | None
    contributions: list[TeamContribution]


def _weighted(pairs: list[tuple[float, float | None]]) -> float | None:
    usable = [(w, v) for w, v in pairs if v is not None]
    wsum = sum(w for w, _ in usable)
    if wsum <= 0:
        return None
    return sum(w * v for w, v in usable) / wsum


def team_progress(initiatives: Iterable[InitiativeSummary]) -> TeamProgress:
    """Importance-weighted aggregation, computed independently for code and validation."""
    contributions: list[TeamContribution] = []
    for ini in initiatives:
        if not ini.is_active or ini.importance <= 0:
            continue
        v = select_active_version(ini)
        if v is None:
            continue
        contributions.append(
            TeamContribution(ini.id, v.id, ini.importance, v.code, v.validation)
        )
    code = _weighted([(c.importance, c.code) for c in contributions])
    val = _weighted([(c.importance, c.validation) for c in contributions])
    return TeamProgress(
        code=_round(code),
        validation=_round(val),
        overall=overall_progress(code, val),
        contributions=contributions,
    )
