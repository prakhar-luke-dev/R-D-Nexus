"""Realistic demo dataset.

    uv run python -m app.seed          # seed if the DB is empty
    uv run python -m app.seed --reset  # wipe and re-seed

URLs use example.* domains on purpose. They are clearly marked placeholders, not real integrations.
"""

import random
import sys
from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, select, update
from sqlalchemy.orm import Session

from app.db import SessionLocal
from app.enums import (
    CompletionState as S,
)
from app.enums import (
    EvidenceType,
    NodeStatus,
    NodeType,
    Relationship,
    ResearchOutcome,
    ResourceType,
)
from app.models import (
    ActivityLog,
    Deliverable,
    Edge,
    Evidence,
    Node,
    PocInitiative,
    PocVersion,
    ProgressSnapshot,
    ProgressTemplate,
    Resource,
    Team,
    TemplateItem,
)
from app.services import progress as engine
from app.services.progress_service import team_progress, version_progress
from app.services.templates import instantiate_deliverables

NOW = datetime.now(UTC).replace(microsecond=0)


def ago(days: float, hours: float = 0) -> datetime:
    return NOW - timedelta(days=days, hours=hours)


class Seeder:
    def __init__(self, db: Session):
        self.db = db
        self.team = Team(name="AI R&D Team", description="Applied AI research & development", created_at=ago(120))
        db.add(self.team)
        db.flush()
        self.nodes: dict[str, Node] = {}

    # --- primitives -----------------------------------------------------------------------
    def node(self, key, type_, title, *, desc="", status=NodeStatus.IN_PROGRESS, owner=None, tags=(),
             meta=None, created=60, resource=None):
        n = Node(
            team_id=self.team.id, type=type_, title=title, description=desc, status=status, owner=owner,
            tags=list(tags), meta=meta or {}, created_by=owner or "seed",
            created_at=ago(created), updated_at=ago(max(created - random.uniform(2, 20), 0.5)),
        )
        self.db.add(n)
        self.db.flush()
        if resource:
            rtype, uri = resource
            n.resource = Resource(resource_type=rtype, uri=uri, created_at=n.created_at)
        self.nodes[key] = n
        return n

    def edge(self, src, tgt, rel, created=None):
        s, t = self.nodes[src], self.nodes[tgt]
        self.db.add(Edge(source_id=s.id, target_id=t.id, relationship=rel, created_by="seed",
                         created_at=ago(created) if created else max(s.created_at, t.created_at)))

    def log(self, days, actor, action, key, description, old=None, new=None):
        n = self.nodes.get(key) if key else None
        self.db.add(ActivityLog(
            team_id=self.team.id, actor_id=actor, node_id=n.id if n else None, node_title=n.title if n else None,
            action=action, description=description, old_value=old, new_value=new, created_at=ago(days),
        ))

    def poc(self, key, title, desc, weight, owner, outcome, status=NodeStatus.IN_PROGRESS, created=100, tags=()):
        n = self.node(key, NodeType.POC, title, desc=desc, owner=owner, status=status, created=created, tags=tags)
        self.db.add(PocInitiative(node_id=n.id, importance_weight=weight, research_outcome=outcome,
                                  created_at=n.created_at))
        self.edge("team", key, Relationship.OWNS)
        self.db.flush()
        return n

    def version(self, key, poc_key, label, title, desc, owner, created, states, *, active, derived_from=None,
                na=None, blocked=None, evidence=None, status=None, superseded=None):
        poc_node = self.nodes[poc_key]
        n = self.node(key, NodeType.VERSION, f"{poc_node.title} {label}", desc=f"{title}. {desc}", owner=owner,
                      created=created, meta={"version_label": label, "headline": title},
                      status=status or (NodeStatus.IN_PROGRESS if active else NodeStatus.HISTORICAL))
        v = PocVersion(node_id=n.id, initiative_id=poc_node.id, version_label=label, is_active=active,
                       created_at=n.created_at, superseded_at=None if active else ago(superseded))
        self.db.add(v)
        self.db.flush()
        self.edge(poc_key, key, Relationship.HAS_VERSION)
        if derived_from:
            self.edge(key, derived_from, Relationship.DERIVED_FROM)
        dels = instantiate_deliverables(self.db, n.id)
        for d in dels:
            st = states.get(d.key, S.NOT_STARTED)
            d.state = st
            d.ever_started = st != S.NOT_STARTED
            d.created_at = n.created_at
            d.updated_at = ago(max(created - random.uniform(3, 30), 0.3))
            d.updated_by = owner
            if na and d.key in na:
                d.is_not_applicable, d.not_applicable_reason, d.state, d.ever_started = True, na[d.key], S.NOT_STARTED, False
            if blocked and d.key in blocked:
                d.is_blocked, d.blocker_reason = True, blocked[d.key]
            if st == S.VERIFIED:
                ev_key = (evidence or {}).get(d.key)
                self._evidence(d, ev_key, owner)
        if active:
            self.db.execute(update(PocInitiative).where(PocInitiative.node_id == poc_node.id)
                            .values(active_version_id=n.id))
        self.db.flush()
        return n

    EV_TYPES = {
        "environment": EvidenceType.REPOSITORY, "core": EvidenceType.REPOSITORY, "integration": EvidenceType.TEST_RESULT,
        "testing": EvidenceType.TEST_RESULT, "demo": EvidenceType.DEMO_RECORDING, "problem": EvidenceType.RESEARCH_DOC,
        "feasibility": EvidenceType.RESEARCH_DOC, "experiments": EvidenceType.EXPERIMENT_REPORT,
        "benchmarking": EvidenceType.BENCHMARK, "demonstration": EvidenceType.DEMO_RECORDING,
        "conclusion": EvidenceType.FINDING,
    }

    def _evidence(self, d: Deliverable, res_key: str | None, owner: str):
        res = self.nodes.get(res_key) if res_key else None
        uri = res.resource.uri if res is not None and res.resource else None
        self.db.add(Evidence(
            deliverable_id=d.id, type=self.EV_TYPES.get(d.key, EvidenceType.OTHER),
            title=res.title if res else f"{d.title} sign-off notes",
            uri=uri or f"https://wiki.example.internal/ai-rnd/evidence/{d.key}",
            description="Seeded evidence", resource_node_id=res.id if res else None,
            created_by=owner, created_at=d.updated_at,
        ))


def run(db: Session) -> None:
    random.seed(7)
    s = Seeder(db)
    s.node("team", NodeType.TEAM, "AI R&D Team", desc="Applied AI research & development: speech, retrieval and "
           "multilingual NLP.", owner="Head of AI R&D", created=120)

    # ===================================================================== Voice AI ======
    s.poc("voice", "Voice AI", "Research and development of a real-time voice AI system involving speech "
          "recognition, VAD, LLM orchestration, and speech synthesis.", 3, "Ananya Rao",
          ResearchOutcome.PARTIALLY_VALIDATED, created=110, tags=["speech", "realtime"])

    s.node("vad", NodeType.RESEARCH, "Smart VAD research", owner="Ananya Rao", created=105, tags=["vad", "turn-taking"],
           desc="Investigating semantic voice-activity detection to reduce false barge-ins and premature cut-offs.",
           meta={"research_question": "Can a lightweight semantic end-of-turn model beat energy-based VAD on "
                                      "barge-in accuracy without adding latency?",
                 "hypothesis": "A small transformer end-of-turn classifier reduces false barge-ins by >30% at "
                               "<40 ms added latency.",
                 "external_urls": ["https://papers.example.org/turn-taking-prediction"]},
           status=NodeStatus.COMPLETED)
    s.node("tts", NodeType.RESEARCH, "TTS engine comparison", owner="Vikram Shah", created=100, tags=["tts"],
           desc="Comparison of neural TTS engines for naturalness, streaming support and cost.",
           meta={"research_question": "Which TTS engine gives the best MOS-to-latency trade-off for streaming?",
                 "hypothesis": "Streaming-native engines outperform batch engines on time-to-first-audio by 2x."},
           status=NodeStatus.COMPLETED)
    s.node("stream_arch", NodeType.DOCUMENTATION, "Streaming architecture", owner="Ananya Rao", created=98,
           desc="Reference architecture for full-duplex streaming: ASR → LLM → TTS with interruption handling.",
           tags=["architecture"], resource=(ResourceType.ARCHITECTURE_NOTE,
                                            "https://wiki.example.internal/ai-rnd/voice/streaming-architecture"))
    s.node("voice_repo", NodeType.CODE, "voice-pipeline repository", owner="Vikram Shah", created=104,
           desc="Monorepo for the voice pipeline: ASR adapters, VAD, orchestration, TTS streaming.",
           tags=["python", "websocket"], resource=(ResourceType.REPOSITORY,
                                                   "https://git.example.internal/ai-rnd/voice-pipeline"))
    s.node("turn_paper", NodeType.PAPER, "Turn-taking prediction in spoken dialogue", owner="Ananya Rao", created=104,
           desc="Survey of turn-taking and end-of-utterance prediction approaches.", tags=["paper", "dialogue"],
           resource=(ResourceType.PAPER, "https://papers.example.org/turn-taking-prediction"))
    s.node("asr_exp", NodeType.EXPERIMENT, "ASR accuracy on accented English", owner="Vikram Shah", created=90,
           status=NodeStatus.COMPLETED, tags=["asr", "wer"],
           desc="Word error rate of candidate ASR engines on Indian-accented call-centre audio.",
           meta={"objective": "Select the ASR engine for v1.", "hypothesis": "Streaming engine A has WER within "
                 "2 pts of the best batch engine.", "model": "Engine A (streaming) vs Engine B (batch)",
                 "dataset": "Internal 6h accented call-centre set", "configuration": "16 kHz mono, 320 ms chunks",
                 "parameters": {"chunk_ms": 320, "beam": 4},
                 "metrics": {"WER (A) %": 11.8, "WER (B) %": 10.9, "RTF (A)": 0.21},
                 "results": "Engine A WER 11.8% vs B 10.9%, at a fraction of the latency.",
                 "observations": "Errors concentrate on numerals and proper nouns.",
                 "conclusion": "Adopt engine A with a numeric normalization post-processor."})
    s.node("latency_exp", NodeType.EXPERIMENT, "Voice latency benchmark", owner="Vikram Shah", created=40,
           status=NodeStatus.COMPLETED, tags=["latency", "benchmark"],
           desc="End-to-end latency (user stop → first audio) across pipeline configurations.",
           meta={"objective": "Quantify v2 latency gains from streaming TTS and semantic VAD.",
                 "hypothesis": "v2 reduces p50 response latency below 700 ms.",
                 "model": "v1 pipeline vs v2 streaming pipeline", "dataset": "300 scripted conversations",
                 "configuration": "Same LLM, same region, warm instances",
                 "parameters": {"runs": 300, "llm": "same model both arms"},
                 "metrics": {"p50 latency (ms)": 640, "p95 latency (ms)": 1180, "v1 p50 latency (ms)": 1420,
                             "false barge-ins %": 3.1},
                 "results": "p50 640 ms (v1: 1420 ms); p95 1180 ms.",
                 "observations": "p95 dominated by LLM first-token time on long contexts.",
                 "conclusion": "Target met for p50; p95 needs LLM-side work."})
    s.node("vad_exp", NodeType.EXPERIMENT, "Semantic VAD A/B test", owner="Ananya Rao", created=34,
           status=NodeStatus.IN_PROGRESS, tags=["vad"],
           desc="A/B test of semantic end-of-turn model against energy VAD on live pilot traffic.",
           meta={"objective": "Validate VAD findings on real traffic.", "hypothesis": "≥30% fewer false barge-ins.",
                 "model": "Semantic EoT classifier (22M params)", "dataset": "Pilot traffic (2 weeks)",
                 "parameters": {"threshold": 0.62},
                 "metrics": {"false barge-ins %": 3.4, "baseline false barge-ins %": 5.5, "added latency (ms)": 28},
                 "results": "Interim: 38% reduction in false barge-ins.", "observations": "Needs more data on "
                 "noisy environments.", "conclusion": ""})
    s.node("vad_finding", NodeType.FINDING, "Semantic VAD cuts false barge-ins by ~38%", owner="Ananya Rao",
           created=30, tags=["vad"], status=NodeStatus.COMPLETED,
           desc="Semantic end-of-turn detection reduces false barge-ins by ~38% with 28 ms added latency.",
           meta={"implications": "Adopt semantic VAD as default; keep energy VAD as fallback for noisy audio.",
                 "confidence": "TENTATIVE"})
    s.node("stream_finding", NodeType.FINDING, "Streaming TTS halves time-to-first-audio", owner="Vikram Shah",
           created=36, status=NodeStatus.COMPLETED, tags=["tts", "latency"],
           desc="Sentence-chunked streaming TTS cut p50 response latency from 1420 ms to 640 ms.",
           meta={"implications": "Streaming TTS is mandatory for conversational UX; batch TTS ruled out.",
                 "confidence": "CONFIRMED"})
    s.node("voice_demo", NodeType.DEMO, "Voice agent demo (v2)", owner="Vikram Shah", created=20,
           status=NodeStatus.IN_PROGRESS, desc="Browser demo of the v2 streaming voice agent.",
           resource=(ResourceType.DEMO, "https://demo.example.internal/voice-v2"))
    s.node("v1_demo", NodeType.DEMO, "Voice pipeline demo recording (v1)", owner="Vikram Shah", created=70,
           status=NodeStatus.COMPLETED, desc="Recorded walkthrough of the v1 pipeline.",
           resource=(ResourceType.DEMO, "https://media.example.internal/ai-rnd/voice-v1-demo.mp4"))

    vs_v1 = {"environment": S.VERIFIED, "core": S.VERIFIED, "integration": S.VERIFIED, "testing": S.IMPLEMENTED,
             "demo": S.VERIFIED, "problem": S.VERIFIED, "feasibility": S.VERIFIED, "experiments": S.VERIFIED,
             "benchmarking": S.IMPLEMENTED, "demonstration": S.VERIFIED, "conclusion": S.VERIFIED}
    s.version("voice_v1", "voice", "v1", "Initial voice pipeline", "Cascaded ASR → LLM → batch TTS with energy VAD.",
              "Ananya Rao", 95, vs_v1, active=False, superseded=45,
              evidence={"environment": "voice_repo", "core": "voice_repo", "integration": "voice_repo",
                        "demo": "v1_demo", "problem": "tts", "feasibility": "tts", "experiments": "asr_exp",
                        "demonstration": "v1_demo", "conclusion": "stream_arch"})
    vs_v2 = {"environment": S.VERIFIED, "core": S.IMPLEMENTED, "integration": S.PARTIAL, "testing": S.STARTED,
             "demo": S.NOT_STARTED, "problem": S.VERIFIED, "feasibility": S.VERIFIED, "experiments": S.IMPLEMENTED,
             "benchmarking": S.PARTIAL, "demonstration": S.STARTED, "conclusion": S.NOT_STARTED}
    s.version("voice_v2", "voice", "v2", "Improved streaming and latency optimization",
              "Full-duplex streaming, semantic VAD and sentence-chunked streaming TTS.", "Ananya Rao", 45, vs_v2,
              active=True, derived_from="voice_v1",
              blocked={"integration": "Waiting on telephony SIP gateway access from the platform team."},
              evidence={"environment": "voice_repo", "problem": "vad", "feasibility": "turn_paper"})

    for src, tgt, rel in [
        ("voice_v1", "tts", Relationship.CONTAINS), ("voice_v1", "asr_exp", Relationship.CONTAINS),
        ("voice_v1", "stream_arch", Relationship.CONTAINS), ("voice_v1", "voice_repo", Relationship.CONTAINS),
        ("voice_v1", "v1_demo", Relationship.CONTAINS), ("voice_v1", "vad", Relationship.CONTAINS),
        ("voice_v2", "vad", Relationship.SHARES_RESOURCE), ("voice_v2", "stream_arch", Relationship.SHARES_RESOURCE),
        ("voice_v2", "voice_repo", Relationship.SHARES_RESOURCE), ("voice_v2", "latency_exp", Relationship.CONTAINS),
        ("voice_v2", "vad_exp", Relationship.CONTAINS), ("voice_v2", "voice_demo", Relationship.CONTAINS),
        ("voice_v2", "turn_paper", Relationship.CONTAINS),
        ("latency_exp", "stream_finding", Relationship.PRODUCED), ("vad_exp", "vad_finding", Relationship.PRODUCED),
        ("vad", "turn_paper", Relationship.REFERENCES), ("vad_exp", "vad", Relationship.REFERENCES),
        ("latency_exp", "stream_arch", Relationship.REFERENCES),
    ]:
        s.edge(src, tgt, rel)

    # =================================================================== RAG Engine ======
    s.poc("rag", "RAG Engine", "Research and development of retrieval-augmented generation architectures.", 2,
          "Rahul Mehta", ResearchOutcome.VALIDATED, created=100, tags=["retrieval", "llm"])
    s.node("rrf", NodeType.RESEARCH, "Reciprocal Rank Fusion (RRF) research", owner="Rahul Mehta", created=60,
           status=NodeStatus.COMPLETED, tags=["fusion", "hybrid"],
           desc="How to fuse BM25 and dense rankings robustly without score calibration.",
           meta={"research_question": "Does RRF fusion beat weighted score fusion on our corpora?",
                 "hypothesis": "RRF (k=60) matches or beats tuned linear fusion without per-corpus tuning."})
    s.node("rrf_paper", NodeType.PAPER, "Reciprocal Rank Fusion (Cormack et al.)", owner="Rahul Mehta", created=60,
           desc="Original RRF paper: rank fusion outperforming Condorcet and individual rank-learning methods.",
           tags=["paper", "ir"], resource=(ResourceType.PAPER, "https://papers.example.org/reciprocal-rank-fusion"))
    s.node("embed_cmp", NodeType.RESEARCH, "Multilingual embedding model comparison", owner="Rahul Mehta",
           created=80, status=NodeStatus.COMPLETED, tags=["embeddings", "multilingual"],
           desc="Comparison of open and hosted embedding models on English and Indic retrieval tasks.",
           meta={"research_question": "Which embedding model gives the best recall@20 across English and Hindi?",
                 "hypothesis": "Multilingual E5-class models beat English-only models on mixed corpora."})
    s.node("ret_bench", NodeType.EXPERIMENT, "Retrieval benchmark: dense baseline", owner="Rahul Mehta",
           created=85, status=NodeStatus.COMPLETED, tags=["benchmark", "ndcg"],
           desc="Dense-only retrieval quality on internal knowledge-base QA.",
           meta={"objective": "Establish a dense retrieval baseline.", "hypothesis": "Dense retrieval reaches "
                 "nDCG@10 ≥ 0.55.", "model": "Dense bi-encoder", "dataset": "KB-QA (1,200 queries)",
                 "parameters": {"top_k": 20, "chunk_tokens": 400},
                 "metrics": {"nDCG@10": 0.52, "Recall@20": 0.71, "MRR": 0.48},
                 "results": "nDCG@10 0.52, slightly below target.", "observations": "Struggles with product "
                 "codes and exact identifiers.", "conclusion": "Add a lexical signal."})
    s.node("hybrid_exp", NodeType.EXPERIMENT, "Hybrid retrieval + reranking", owner="Rahul Mehta", created=30,
           status=NodeStatus.COMPLETED, tags=["hybrid", "rerank"],
           desc="BM25 + dense fused with RRF, followed by cross-encoder reranking.",
           meta={"objective": "Beat the dense baseline by ≥ 8 nDCG points.", "hypothesis": "Hybrid + rerank "
                 "fixes identifier queries.", "model": "BM25 + dense (RRF k=60) → cross-encoder",
                 "dataset": "KB-QA (1,200 queries)", "parameters": {"rrf_k": 60, "rerank_top_n": 50},
                 "metrics": {"nDCG@10": 0.63, "Recall@20": 0.84, "MRR": 0.59, "p95 latency (ms)": 310},
                 "results": "nDCG@10 0.63 (+11 pts) at 310 ms p95.", "observations": "Reranker is 70% of latency.",
                 "conclusion": "Adopt hybrid + rerank; distil reranker to cut latency."})
    s.node("rag_arch", NodeType.DOCUMENTATION, "RAG architecture document", owner="Rahul Mehta", created=28,
           desc="Target architecture: ingestion, chunking, hybrid index, rerank, grounding and citations.",
           tags=["architecture"], resource=(ResourceType.ARCHITECTURE_NOTE,
                                            "https://wiki.example.internal/ai-rnd/rag/architecture"))
    s.node("rag_repo", NodeType.CODE, "rag-engine repository", owner="Rahul Mehta", created=88,
           desc="Retrieval service, indexers and evaluation harness.", tags=["python"],
           resource=(ResourceType.REPOSITORY, "https://git.example.internal/ai-rnd/rag-engine"))
    s.node("hybrid_finding", NodeType.FINDING, "Hybrid + rerank adds 11 nDCG points", owner="Rahul Mehta",
           created=24, status=NodeStatus.COMPLETED, tags=["retrieval"],
           desc="RRF hybrid retrieval with cross-encoder reranking improves nDCG@10 from 0.52 to 0.63.",
           meta={"implications": "Hybrid retrieval becomes the default; reranker latency is the next bottleneck.",
                 "confidence": "CONFIRMED"})
    s.node("rag_results", NodeType.DOCUMENTATION, "Retrieval experiment results report", owner="Rahul Mehta",
           created=22, desc="Consolidated benchmark tables for dense vs hybrid vs hybrid+rerank.",
           tags=["report"], resource=(ResourceType.EXPERIMENT_REPORT,
                                      "https://wiki.example.internal/ai-rnd/rag/results"))

    rag_v1 = {"environment": S.VERIFIED, "core": S.VERIFIED, "integration": S.VERIFIED, "testing": S.VERIFIED,
              "problem": S.VERIFIED, "feasibility": S.VERIFIED, "experiments": S.VERIFIED, "benchmarking": S.VERIFIED,
              "demonstration": S.IMPLEMENTED, "conclusion": S.VERIFIED}
    s.version("rag_v1", "rag", "v1", "Dense retrieval", "Single-stage dense retrieval baseline.", "Rahul Mehta", 85,
              rag_v1, active=False, superseded=35, na={"demo": "Dense baseline was evaluated offline only; no demo in scope."},
              evidence={k: "rag_repo" for k in ("environment", "core", "integration", "testing")}
              | {"problem": "embed_cmp", "feasibility": "embed_cmp", "experiments": "ret_bench",
                 "benchmarking": "ret_bench", "conclusion": "ret_bench"})
    rag_v2 = {"environment": S.VERIFIED, "core": S.VERIFIED, "integration": S.IMPLEMENTED, "testing": S.PARTIAL,
              "demo": S.STARTED, "problem": S.VERIFIED, "feasibility": S.VERIFIED, "experiments": S.IMPLEMENTED,
              "benchmarking": S.IMPLEMENTED, "demonstration": S.PARTIAL, "conclusion": S.NOT_STARTED}
    s.version("rag_v2", "rag", "v2", "Hybrid dense and sparse retrieval with reranking",
              "BM25 + dense with RRF fusion and a cross-encoder reranker.", "Rahul Mehta", 35, rag_v2, active=True,
              derived_from="rag_v1", evidence={"environment": "rag_repo", "core": "rag_repo", "problem": "rrf",
                                               "feasibility": "rrf_paper"})
    for src, tgt, rel in [
        ("rag_v1", "embed_cmp", Relationship.CONTAINS), ("rag_v1", "ret_bench", Relationship.CONTAINS),
        ("rag_v1", "rag_repo", Relationship.CONTAINS),
        ("rag_v2", "rag_repo", Relationship.SHARES_RESOURCE), ("rag_v2", "embed_cmp", Relationship.SHARES_RESOURCE),
        ("rag_v2", "rrf", Relationship.CONTAINS), ("rag_v2", "hybrid_exp", Relationship.CONTAINS),
        ("rag_v2", "rag_arch", Relationship.CONTAINS), ("rag_v2", "rag_results", Relationship.CONTAINS),
        ("rrf", "rrf_paper", Relationship.CONTAINS), ("hybrid_exp", "hybrid_finding", Relationship.PRODUCED),
        ("hybrid_exp", "ret_bench", Relationship.REFERENCES), ("hybrid_exp", "rrf", Relationship.REFERENCES),
        ("rag_results", "hybrid_exp", Relationship.REFERENCES),
    ]:
        s.edge(src, tgt, rel)

    # ==================================================================== Indic NLP ======
    s.poc("indic", "Indic NLP", "Research into multilingual NLP approaches and fine-tuning strategies for Indic "
          "languages.", 1, "Priya Natarajan", ResearchOutcome.INCONCLUSIVE, status=NodeStatus.BLOCKED, created=70,
          tags=["multilingual", "fine-tuning"])
    s.node("indicbert", NodeType.RESEARCH, "IndicBERT research", owner="Priya Natarajan", created=68,
           status=NodeStatus.COMPLETED, tags=["indicbert", "encoders"],
           desc="Review of IndicBERT and multilingual encoders for classification and NER in 11 Indic languages.",
           meta={"research_question": "Do Indic-specific encoders beat general multilingual encoders after "
                                      "fine-tuning on small labelled sets?",
                 "hypothesis": "IndicBERT outperforms mBERT by ≥ 5 F1 on low-resource languages."})
    s.node("dataset", NodeType.RESEARCH, "Indic dataset analysis", owner="Arjun Iyer", created=64,
           status=NodeStatus.COMPLETED, tags=["datasets"],
           desc="Coverage, quality and licensing analysis of public Indic corpora and our labelled data.",
           meta={"research_question": "Is there enough labelled data per language for reliable evaluation?",
                 "hypothesis": "Hindi/Tamil are sufficient; Marathi/Odia need additional annotation."})
    s.node("ft_exp", NodeType.EXPERIMENT, "Fine-tuning: IndicBERT vs mBERT", owner="Arjun Iyer", created=45,
           status=NodeStatus.COMPLETED, tags=["fine-tuning"],
           desc="Fine-tuning both encoders on intent classification across 5 languages.",
           meta={"objective": "Compare encoders after fine-tuning.", "hypothesis": "IndicBERT +5 F1.",
                 "model": "IndicBERT vs mBERT", "dataset": "Intent set (5 languages, 18k utterances)",
                 "parameters": {"epochs": 4, "lr": 3e-5, "batch": 32},
                 "metrics": {"F1 IndicBERT (hi)": 0.86, "F1 mBERT (hi)": 0.84, "F1 IndicBERT (or)": 0.71,
                             "F1 mBERT (or)": 0.69},
                 "results": "IndicBERT ahead by ~2 F1, below the 5-point hypothesis.",
                 "observations": "Variance across seeds is as large as the gap for Odia.",
                 "conclusion": "Inconclusive: evaluation set too small for low-resource languages."})
    s.node("eval_report", NodeType.DOCUMENTATION, "Indic evaluation report", owner="Priya Natarajan", created=30,
           desc="Evaluation protocol, results by language and statistical significance analysis.", tags=["report"],
           resource=(ResourceType.EXPERIMENT_REPORT, "https://wiki.example.internal/ai-rnd/indic/eval-report"))
    s.node("tokenizer_finding", NodeType.FINDING, "Tokenizer fertility drives low-resource quality",
           owner="Arjun Iyer", created=28, tags=["tokenization"], status=NodeStatus.COMPLETED,
           desc="Languages with high tokenizer fertility show the largest quality gaps, more than model choice.",
           meta={"implications": "Evaluate tokenizer extension before larger fine-tuning runs; relevant to RAG "
                                 "multilingual chunking too.", "confidence": "TENTATIVE"})
    s.node("indic_repo", NodeType.CODE, "indic-nlp-experiments repository", owner="Arjun Iyer", created=60,
           desc="Training and evaluation scripts.", tags=["python", "pytorch"],
           resource=(ResourceType.REPOSITORY, "https://git.example.internal/ai-rnd/indic-nlp"))
    indic_v1 = {"environment": S.VERIFIED, "core": S.IMPLEMENTED, "testing": S.STARTED, "problem": S.VERIFIED,
                "feasibility": S.VERIFIED, "experiments": S.VERIFIED, "benchmarking": S.PARTIAL,
                "demonstration": S.STARTED, "conclusion": S.PARTIAL}
    s.version("indic_v1", "indic", "v1", "Baseline multilingual model evaluation",
              "Fine-tune and evaluate multilingual encoders on Indic intent classification.", "Priya Natarajan", 60,
              indic_v1, active=True, status=NodeStatus.BLOCKED,
              na={"integration": "Offline evaluation POC; product integration out of scope."},
              blocked={"benchmarking": "Annotated Marathi/Odia evaluation set pending from annotation vendor."},
              evidence={"environment": "indic_repo", "problem": "dataset", "feasibility": "indicbert",
                        "experiments": "ft_exp"})
    for src, tgt, rel in [
        ("indic_v1", "indicbert", Relationship.CONTAINS), ("indic_v1", "dataset", Relationship.CONTAINS),
        ("indic_v1", "ft_exp", Relationship.CONTAINS), ("indic_v1", "eval_report", Relationship.CONTAINS),
        ("indic_v1", "indic_repo", Relationship.CONTAINS), ("ft_exp", "tokenizer_finding", Relationship.PRODUCED),
        ("indic_v1", "embed_cmp", Relationship.SHARES_RESOURCE),  # research shared across POCs
        ("tokenizer_finding", "rag", Relationship.REFERENCES),  # a finding influencing another initiative
        ("ft_exp", "indicbert", Relationship.REFERENCES), ("eval_report", "ft_exp", Relationship.REFERENCES),
    ]:
        s.edge(src, tgt, rel)
    db.flush()

    _activity(s)
    _snapshots(s)
    db.commit()


def _activity(s: Seeder) -> None:
    L = s.log
    L(110, "Head of AI R&D", "POC_CREATED", "voice", "New POC “Voice AI” created (importance 3)")
    L(100, "Head of AI R&D", "POC_CREATED", "rag", "New POC “RAG Engine” created (importance 2)")
    L(95, "Ananya Rao", "VERSION_CREATED", "voice_v1", "New version v1 of Voice AI")
    L(90, "Vikram Shah", "EXPERIMENT_COMPLETED", "asr_exp", "ASR accuracy on accented English completed: WER 11.8%")
    L(85, "Rahul Mehta", "VERSION_CREATED", "rag_v1", "New version v1 of RAG Engine")
    L(84, "Rahul Mehta", "SCOPE_CHANGED", "rag_v1", "Marked N/A: Reproducible runnable demo (RAG Engine v1). "
      "Reason: Dense baseline was evaluated offline only.")
    L(78, "Rahul Mehta", "EXPERIMENT_COMPLETED", "ret_bench", "Retrieval benchmark: dense baseline completed "
      "(nDCG@10 0.52)")
    L(72, "Vikram Shah", "DELIVERABLE_UPDATED", "voice_v1", "Reproducible runnable demo (Voice AI v1): Implemented → "
      "Verified")
    L(70, "Head of AI R&D", "POC_CREATED", "indic", "New POC “Indic NLP” created (importance 1)")
    L(60, "Priya Natarajan", "VERSION_CREATED", "indic_v1", "New version v1 of Indic NLP")
    L(59, "Priya Natarajan", "SCOPE_CHANGED", "indic_v1", "Marked N/A: Integration (Indic NLP v1). Reason: Offline "
      "evaluation POC; product integration out of scope.")
    L(60, "Rahul Mehta", "NODE_CREATED", "rrf", "Research “Reciprocal Rank Fusion (RRF) research” added to RAG Engine v2")
    L(45, "Ananya Rao", "VERSION_CREATED", "voice_v2", "New version v2 of Voice AI, derived from v1; 3 resource(s) "
      "shared")
    L(45, "Ananya Rao", "ACTIVE_VERSION_CHANGED", "voice", "Voice AI: active version is now v2")
    L(38, "Arjun Iyer", "EXPERIMENT_COMPLETED", "ft_exp", "Fine-tuning: IndicBERT vs mBERT completed (+2 F1)")
    L(36, "Vikram Shah", "FINDING_ADDED", "stream_finding", "Finding added: Streaming TTS halves time-to-first-audio")
    L(35, "Rahul Mehta", "VERSION_CREATED", "rag_v2", "New version v2 of RAG Engine, derived from v1; 2 resource(s) "
      "shared")
    L(35, "Rahul Mehta", "ACTIVE_VERSION_CHANGED", "rag", "RAG Engine: active version is now v2")
    L(32, "Vikram Shah", "EXPERIMENT_COMPLETED", "latency_exp", "Voice latency benchmark completed: p50 640 ms")
    L(30, "Ananya Rao", "FINDING_ADDED", "vad_finding", "Finding added: Semantic VAD cuts false barge-ins by ~38%")
    L(26, "Priya Natarajan", "OUTCOME_CHANGED", "indic", "Indic NLP research outcome: Pending → Inconclusive",
      {"research_outcome": "PENDING"}, {"research_outcome": "INCONCLUSIVE"})
    L(24, "Rahul Mehta", "EXPERIMENT_COMPLETED", "hybrid_exp", "Hybrid retrieval + reranking completed: nDCG@10 0.63")
    L(22, "Rahul Mehta", "OUTCOME_CHANGED", "rag", "RAG Engine research outcome: Pending → Validated",
      {"research_outcome": "PENDING"}, {"research_outcome": "VALIDATED"})
    L(18, "Priya Natarajan", "BLOCKED", "indic_v1", "Benchmarking and evaluation (Indic NLP v1) blocked: Annotated "
      "Marathi/Odia evaluation set pending from annotation vendor.")
    L(18, "Priya Natarajan", "INITIATIVE_BLOCKED", "indic", "Indic NLP status in progress → blocked")
    L(14, "Rahul Mehta", "DELIVERABLE_UPDATED", "rag_v2", "Integration (RAG Engine v2): Partial → Implemented")
    L(12, "Ananya Rao", "EVIDENCE_ATTACHED", "voice_v2", "Evidence “Turn-taking prediction in spoken dialogue” attached "
      "to Research and feasibility analysis (Voice AI v2)")
    L(9, "Vikram Shah", "BLOCKED", "voice_v2", "Integration (Voice AI v2) blocked: Waiting on telephony SIP gateway "
      "access from the platform team.")
    L(6, "Ananya Rao", "DELIVERABLE_UPDATED", "voice_v2", "Experiment design and execution (Voice AI v2): Partial → "
      "Implemented")
    L(4, "Rahul Mehta", "DELIVERABLE_UPDATED", "rag_v2", "Benchmarking and evaluation (RAG Engine v2): Partial → "
      "Implemented")
    L(2, "Vikram Shah", "DELIVERABLE_UPDATED", "voice_v2", "Error handling and testing (Voice AI v2): Not Started → "
      "Started")


def _snapshots(s: Seeder) -> None:
    """Backfilled trend so the management overview has history. The final point is the real current value."""
    db = s.db
    versions = db.scalars(select(PocVersion)).all()
    for v in versions:
        db.refresh(v, attribute_names=["deliverables"])
        p = version_progress(v)
        start_days = (NOW - v.created_at.replace(tzinfo=UTC)).days
        steps = max(start_days // 7, 1)
        for i in range(steps + 1):
            frac = i / steps
            d = start_days - i * 7
            if v.superseded_at is not None:
                d = max(d, (NOW - v.superseded_at.replace(tzinfo=UTC)).days)
            db.add(ProgressSnapshot(
                team_id=s.team.id, version_id=v.node_id,
                code_score=round((p.code or 0) * frac, 2), validation_score=round((p.validation or 0) * frac, 2),
                overall_score=round((p.overall or 0) * frac, 2), calculated_at=ago(max(d, 0.01)),
            ))
    t = team_progress(db, s.team.id)
    weeks = 10
    for i in range(weeks + 1):
        frac = 0.35 + 0.65 * (i / weeks) ** 0.9
        jitter = 0 if i == weeks else random.uniform(-1.5, 1.5)
        code = (t.code or 0) * frac + jitter
        val = (t.validation or 0) * frac + jitter
        db.add(ProgressSnapshot(
            team_id=s.team.id, version_id=None, code_score=round(code, 2), validation_score=round(val, 2),
            overall_score=engine.overall_progress(code, val), calculated_at=ago((weeks - i) * 7 + 0.01),
        ))


def reset(db: Session) -> None:
    db.execute(update(PocInitiative).values(active_version_id=None))
    for model in (ActivityLog, ProgressSnapshot, Evidence, Deliverable, Edge, Resource, PocVersion, PocInitiative,
                  TemplateItem, ProgressTemplate, Node, Team):
        db.execute(delete(model))
    db.commit()


def main() -> None:
    db = SessionLocal()
    try:
        if "--reset" in sys.argv:
            reset(db)
        if db.scalars(select(Team)).first():
            print("Database already seeded (use --reset to re-seed).")
            return
        run(db)
        t = team_progress(db, db.scalars(select(Team)).first().id)
        print(f"Seeded. Team progress: code {t.code}%, validation {t.validation}%, overall {t.overall}%")
    finally:
        db.close()


if __name__ == "__main__":
    main()
