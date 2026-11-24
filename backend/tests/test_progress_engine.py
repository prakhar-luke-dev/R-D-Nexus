import pytest

from app.enums import CompletionState as S
from app.enums import DeliverableCategory as C
from app.services import progress as p

CODE_DEFAULT = [("environment", 10), ("core", 35), ("integration", 20), ("testing", 20), ("demo", 15)]


def code_items(states, na=()):
    return [
        p.DeliverableInput(id=k, category=C.CODE, weight=w, state=states.get(k, S.NOT_STARTED), not_applicable=k in na)
        for k, w in CODE_DEFAULT
    ]


def test_completion_scale():
    assert [p.state_score(s) for s in S] == [0, 0.25, 0.5, 0.75, 1.0]


def test_brief_code_example_is_51_25():
    items = code_items({"environment": S.VERIFIED, "core": S.IMPLEMENTED, "integration": S.PARTIAL,
                        "testing": S.STARTED, "demo": S.NOT_STARTED})
    r = p.category_progress(items)
    assert r.progress == 51.25
    assert sum(li.contribution for li in r.items) == pytest.approx(51.25)


def test_not_applicable_normalizes_remaining_weights():
    # Integration (20) N/A → remaining 80 points normalized to 100%.
    items = code_items({"environment": S.VERIFIED, "core": S.VERIFIED, "testing": S.VERIFIED, "demo": S.VERIFIED},
                       na={"integration"})
    r = p.category_progress(items)
    assert r.progress == 100.0
    assert r.applicable_weight == 80
    assert sum(li.normalized_weight for li in r.items) == pytest.approx(100)


def test_not_applicable_partial_example():
    items = code_items({"environment": S.VERIFIED, "core": S.IMPLEMENTED, "testing": S.STARTED},
                       na={"integration"})
    # (10 + 26.25 + 5) / 80
    assert p.category_progress(items).progress == pytest.approx(51.56, abs=0.01)


def test_all_not_applicable_is_none_not_zero():
    items = code_items({}, na={k for k, _ in CODE_DEFAULT})
    assert p.category_progress(items).progress is None


def test_overall_is_50_50():
    assert p.overall_progress(80, 40) == 60
    assert p.overall_progress(72.5, 45.0) == 58.75


def test_overall_with_missing_category_uses_the_other():
    assert p.overall_progress(None, 40) == 40
    assert p.overall_progress(None, None) is None


def test_overall_weights_configurable():
    assert p.overall_progress(80, 40, code_weight=0.75, validation_weight=0.25) == 70


def test_version_progress_keeps_categories_independent():
    items = code_items({"core": S.VERIFIED}) + [
        p.DeliverableInput(category=C.VALIDATION, weight=100, state=S.PARTIAL)
    ]
    vp = p.version_progress(items)
    assert vp.code == 35.0
    assert vp.validation == 50.0
    assert vp.overall == 42.5


def ini(id_, importance, code, val, *, active=True, extra_versions=()):
    versions = [p.VersionSummary(id=f"{id_}-cur", is_active=True, code=code, validation=val), *extra_versions]
    return p.InitiativeSummary(id=id_, importance=importance, is_active=active, active_version_id=f"{id_}-cur",
                               versions=versions)


def test_team_weighted_aggregation_matches_brief_example():
    # Brief example, using overall values as both rings → team overall 62.67%.
    t = p.team_progress([ini("voice", 3, 68, 68), ini("rag", 2, 65, 65), ini("indic", 1, 42, 42)])
    assert t.code == pytest.approx(62.67, abs=0.01)
    assert t.validation == pytest.approx(62.67, abs=0.01)
    assert t.overall == pytest.approx(62.67, abs=0.01)


def test_team_rings_calculated_independently():
    t = p.team_progress([ini("a", 3, 100, 0), ini("b", 1, 0, 100)])
    assert t.code == 75.0
    assert t.validation == 25.0
    assert t.overall == 50.0


def test_historical_versions_excluded():
    old = p.VersionSummary(id="voice-v1", is_active=False, code=100, validation=100)
    t = p.team_progress([ini("voice", 1, 10, 20, extra_versions=[old])])
    assert (t.code, t.validation) == (10, 20)
    assert [c.version_id for c in t.contributions] == ["voice-cur"]


def test_active_version_selection_requires_active_flag():
    stale = p.InitiativeSummary(
        id="x", importance=1, is_active=True, active_version_id="x-v1",
        versions=[p.VersionSummary(id="x-v1", is_active=False, code=90, validation=90)],
    )
    assert p.select_active_version(stale) is None
    assert p.team_progress([stale]).code is None


def test_inactive_initiatives_excluded():
    t = p.team_progress([ini("a", 1, 50, 50), ini("b", 5, 100, 100, active=False)])
    assert t.code == 50


def test_blocked_is_not_part_of_the_engine_input():
    # BLOCKED is a status flag; DeliverableInput has no blocked field, so it can't reduce scores.
    assert "blocked" not in p.DeliverableInput.__dataclass_fields__
