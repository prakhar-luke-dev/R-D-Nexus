"""End-to-end API tests covering the brief's acceptance workflow and business rules."""

import pytest

from tests.conftest import find


def deliverables(client, version_id):
    return {d["key"]: d for d in client.get(f"/api/versions/{version_id}/deliverables").json()["deliverables"]}


def team(client):
    return client.get("/api/team/progress").json()


def test_graph_shape(graph):
    root = next(n for n in graph["nodes"] if n["id"] == graph["root_id"])
    assert root["type"] == "TEAM"
    assert root["progress"]["code_progress"] == pytest.approx(58.8, abs=0.01)
    assert {n["title"] for n in graph["nodes"] if n["type"] == "POC"} == {"Voice AI", "RAG Engine", "Indic NLP"}
    # Shared resources are canonical: one node, multiple incoming edges.
    arch = find(graph, "Streaming architecture")
    incoming = [e for e in graph["edges"] if e["target_id"] == arch["id"]]
    assert len(incoming) >= 2


def test_team_progress_uses_only_active_versions(client, graph):
    t = team(client)
    labels = {c["initiative_title"]: c["version_label"] for c in t["contributions"]}
    assert labels == {"Voice AI": "v2", "RAG Engine": "v2", "Indic NLP": "v1"}


def test_acceptance_flow(client, graph):
    v2 = find(graph, "Voice AI v2")
    assert v2["progress"] == {"code_progress": 51.25, "validation_progress": 60.0, "overall_progress": 55.63}
    before_team = team(client)

    # Partial → Implemented, recalculated on the backend
    integ = deliverables(client, v2["id"])["integration"]
    assert integ["state"] == "PARTIAL" and integ["is_blocked"]
    r = client.patch(f"/api/deliverables/{integ['id']}", json={"state": "IMPLEMENTED"})
    assert r.status_code == 200, r.text
    assert r.json()["is_blocked"]  # blocked stays a separate status
    prog = client.get(f"/api/versions/{v2['id']}/progress").json()
    assert prog["code_progress"] == 56.25
    assert team(client)["code_progress"] > before_team["code_progress"]

    # Activity log records it
    acts = client.get(f"/api/activity?node_id={v2['id']}").json()
    assert any(a["action"] == "DELIVERABLE_UPDATED" and a["actor_id"] == "tester" for a in acts)
    assert any(a["action"] == "PROGRESS_CHANGED" for a in acts)

    # Verified requires evidence
    r = client.patch(f"/api/deliverables/{integ['id']}", json={"state": "VERIFIED"})
    assert r.status_code == 422 and r.json()["code"] == "evidence_required"
    r = client.post(f"/api/deliverables/{integ['id']}/evidence",
                    json={"type": "TEST_RESULT", "title": "SIP integration test run", "uri": "https://ci.example/1"})
    assert r.status_code == 201
    r = client.patch(f"/api/deliverables/{integ['id']}", json={"state": "VERIFIED"})
    assert r.status_code == 200 and r.json()["state"] == "VERIFIED"

    # New version starts independent; previous becomes historical; shared resources not duplicated
    node_count = len(client.get("/api/graph").json()["nodes"])
    arch = find(graph, "Streaming architecture")
    r = client.post(f"/api/pocs/{find(graph, 'Voice AI')['id']}/versions",
                    json={"version_label": "v3", "description": "New TTS architecture",
                          "reuse_node_ids": [arch["id"]]})
    assert r.status_code == 201, r.text
    v3 = r.json()
    assert v3["is_active"] and v3["progress"]["code_progress"] == 0 and v3["progress"]["validation_progress"] == 0
    g = client.get("/api/graph").json()
    assert len(g["nodes"]) == node_count + 1  # only the version node was added
    assert sum(1 for n in g["nodes"] if n["title"] == "Streaming architecture") == 1
    old = next(n for n in g["nodes"] if n["id"] == v2["id"])
    assert old["version"]["is_active"] is False and old["status"] == "HISTORICAL"
    assert old["progress"]["code_progress"] > 0  # history keeps its own numbers
    assert any(e["source_id"] == v3["id"] and e["target_id"] == arch["id"] for e in g["edges"])
    assert any(e["source_id"] == v3["id"] and e["target_id"] == v2["id"] and e["relationship"] == "DERIVED_FROM"
               for e in g["edges"])

    t = team(client)
    voice = next(c for c in t["contributions"] if c["initiative_title"] == "Voice AI")
    assert voice["version_label"] == "v3" and voice["code_progress"] == 0

    # Historical versions are read-only
    d = deliverables(client, v2["id"])["testing"]
    assert client.patch(f"/api/deliverables/{d['id']}", json={"state": "PARTIAL"}).status_code == 409


def test_na_rules(client, graph):
    v2 = find(graph, "Voice AI v2")
    ds = deliverables(client, v2["id"])
    # Started work can't be made N/A
    r = client.patch(f"/api/deliverables/{ds['testing']['id']}",
                     json={"is_not_applicable": True, "not_applicable_reason": "x"})
    assert r.status_code == 409
    # Reason is required
    r = client.patch(f"/api/deliverables/{ds['demo']['id']}", json={"is_not_applicable": True})
    assert r.status_code == 422
    r = client.patch(f"/api/deliverables/{ds['demo']['id']}",
                     json={"is_not_applicable": True, "not_applicable_reason": "Demo covered by v1 recording"})
    assert r.status_code == 200
    # 51.25 / 85 applicable
    assert client.get(f"/api/versions/{v2['id']}/progress").json()["code_progress"] == pytest.approx(60.29, abs=0.01)
    acts = client.get(f"/api/activity?node_id={v2['id']}&action=SCOPE_CHANGED").json()
    assert acts and "Demo covered" in acts[0]["description"]
    # Once started then reset, it still can't go N/A (no retroactive scope trimming)
    t = ds["testing"]
    client.patch(f"/api/deliverables/{t['id']}", json={"state": "NOT_STARTED"})
    r = client.patch(f"/api/deliverables/{t['id']}", json={"is_not_applicable": True, "not_applicable_reason": "x"})
    assert r.status_code == 409


def test_verification_exception(client, graph):
    v2 = find(graph, "Voice AI v2")
    core = deliverables(client, v2["id"])["core"]
    r = client.patch(f"/api/deliverables/{core['id']}", json={"verification_exception": True})
    assert r.status_code == 422  # needs a reason
    r = client.patch(f"/api/deliverables/{core['id']}",
                     json={"verification_exception": True, "verification_exception_reason": "Signed off in review"})
    assert r.status_code == 200
    assert client.patch(f"/api/deliverables/{core['id']}", json={"state": "VERIFIED"}).status_code == 200


def test_blocked_does_not_change_score(client, graph):
    v2 = find(graph, "Voice AI v2")
    core = deliverables(client, v2["id"])["core"]
    before = client.get(f"/api/versions/{v2['id']}/progress").json()
    r = client.patch(f"/api/deliverables/{core['id']}", json={"is_blocked": True, "blocker_reason": "GPU quota"})
    assert r.status_code == 200
    after = client.get(f"/api/versions/{v2['id']}/progress").json()
    assert after["code_progress"] == before["code_progress"]
    assert any(b["deliverable_id"] == core["id"] for b in after["blockers"])


def test_importance_change_logged_and_applied(client, graph):
    indic = find(graph, "Indic NLP")
    r = client.patch(f"/api/pocs/{indic['id']}", json={"importance_weight": 6, "reason": "Strategic priority"})
    assert r.status_code == 200
    t = team(client)
    # (3·51.25 + 2·73.75 + 6·51.5625) / 11
    assert t["code_progress"] == pytest.approx((153.75 + 147.5 + 6 * 51.5625) / 11, abs=0.01)
    acts = client.get(f"/api/activity?action=IMPORTANCE_CHANGED").json()
    assert acts and "Strategic priority" in acts[0]["description"]


def test_evidence_reuse_requires_explicit_acceptance(client, graph):
    voice = find(graph, "Voice AI")
    v1 = find(graph, "Voice AI v1")
    v2 = find(graph, "Voice AI v2")
    src = next(e for e in deliverables(client, v1["id"])["core"]["evidence"])
    target = deliverables(client, v2["id"])["core"]
    assert target["evidence"] == []
    r = client.post(f"/api/evidence/{src['id']}/reuse", json={"target_deliverable_id": target["id"]})
    assert r.status_code == 201 and r.json()["accepted_by"] == "tester"
    assert client.post(f"/api/evidence/{src['id']}/reuse",
                       json={"target_deliverable_id": target["id"]}).status_code == 409
    assert client.get(f"/api/activity?action=EVIDENCE_REUSED").json()
    assert voice


def test_edges_and_deletion_rules(client, graph):
    vad = find(graph, "Smart VAD research")
    rag = find(graph, "RAG Engine")
    r = client.post("/api/edges", json={"source_id": vad["id"], "target_id": rag["id"], "relationship": "REFERENCES"})
    assert r.status_code == 201
    dup = client.post("/api/edges", json={"source_id": vad["id"], "target_id": rag["id"], "relationship": "REFERENCES"})
    assert dup.status_code == 409
    # Hierarchy cycle prevented: Voice AI is an ancestor of VAD research
    voice = find(graph, "Voice AI")
    cyc = client.post("/api/edges", json={"source_id": vad["id"], "target_id": voice["id"], "relationship": "CONTAINS"})
    assert cyc.status_code == 409
    # Deleting a referenced node requires explicit cascade
    assert client.delete(f"/api/nodes/{vad['id']}").status_code == 409
    r = client.delete(f"/api/nodes/{vad['id']}?cascade_edges=true")
    assert r.status_code == 200 and r.json()["deleted_edges"]
    # Team root and active versions are protected
    assert client.delete(f"/api/nodes/{graph['root_id']}?cascade_edges=true").status_code == 409
    v2 = find(graph, "Voice AI v2")
    assert client.delete(f"/api/nodes/{v2['id']}?cascade_edges=true").status_code == 409


def test_create_poc_and_child_node(client):
    r = client.post("/api/pocs", json={"type": "POC", "title": "Agentic Workflows", "importance_weight": 2})
    assert r.status_code == 201, r.text
    poc = r.json()
    assert poc["poc"]["active_version_label"] == "v1"
    assert poc["progress"]["code_progress"] == 0
    vid = poc["poc"]["active_version_id"]
    r = client.post("/api/nodes", json={"type": "EXPERIMENT", "title": "Tool-use eval", "parent_id": vid})
    assert r.status_code == 201
    g = client.get("/api/graph").json()
    assert any(e["source_id"] == vid and e["target_id"] == r.json()["id"] for e in g["edges"])
    # New POC with 0% now dilutes team progress
    assert team(client)["code_progress"] < 58.8


def test_overview(client):
    o = client.get("/api/overview").json()
    assert o["active_poc_count"] == 3
    assert any(p["title"] == "Indic NLP" for p in o["blocked"])
    assert o["outcomes"]["INCONCLUSIVE"] == 1
    assert o["trend"] and o["trend"][-1]["overall_progress"] == pytest.approx(62.0, abs=0.01)
