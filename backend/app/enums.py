"""Domain vocabularies. Stored as strings in the DB so they can be extended without migrations."""

from enum import StrEnum


class NodeType(StrEnum):
    TEAM = "TEAM"
    INITIATIVE = "INITIATIVE"
    POC = "POC"
    VERSION = "VERSION"
    RESEARCH = "RESEARCH"
    CODE = "CODE"
    EXPERIMENT = "EXPERIMENT"
    FINDING = "FINDING"
    PAPER = "PAPER"
    DOCUMENTATION = "DOCUMENTATION"
    DEMO = "DEMO"


# Node types that carry a canonical `resources` record (URI, tags, file).
RESOURCE_NODE_TYPES = {
    NodeType.CODE,
    NodeType.PAPER,
    NodeType.DOCUMENTATION,
    NodeType.DEMO,
}


class Relationship(StrEnum):
    OWNS = "OWNS"
    HAS_VERSION = "HAS_VERSION"
    VERSION_OF = "VERSION_OF"
    DERIVED_FROM = "DERIVED_FROM"
    CONTAINS = "CONTAINS"
    REFERENCES = "REFERENCES"
    SHARES_RESOURCE = "SHARES_RESOURCE"
    PRODUCED = "PRODUCED"


# Relationships that define the expand/collapse hierarchy (source = parent, target = child).
# Every other relationship is drawn as a cross-link between nodes that are already visible.
HIERARCHICAL_RELATIONSHIPS = {
    Relationship.OWNS,
    Relationship.HAS_VERSION,
    Relationship.CONTAINS,
    Relationship.PRODUCED,
    Relationship.SHARES_RESOURCE,
}


class NodeStatus(StrEnum):
    PLANNED = "PLANNED"
    IN_PROGRESS = "IN_PROGRESS"
    BLOCKED = "BLOCKED"
    ON_HOLD = "ON_HOLD"
    COMPLETED = "COMPLETED"
    HISTORICAL = "HISTORICAL"
    ARCHIVED = "ARCHIVED"


class ResearchOutcome(StrEnum):
    PENDING = "PENDING"
    VALIDATED = "VALIDATED"
    PARTIALLY_VALIDATED = "PARTIALLY_VALIDATED"
    INCONCLUSIVE = "INCONCLUSIVE"
    REJECTED = "REJECTED"
    READY_FOR_PRODUCTION = "READY_FOR_PRODUCTION"


class DeliverableCategory(StrEnum):
    CODE = "CODE"
    VALIDATION = "VALIDATION"


class CompletionState(StrEnum):
    NOT_STARTED = "NOT_STARTED"
    STARTED = "STARTED"
    PARTIAL = "PARTIAL"
    IMPLEMENTED = "IMPLEMENTED"
    VERIFIED = "VERIFIED"


COMPLETION_SCORES: dict[CompletionState, float] = {
    CompletionState.NOT_STARTED: 0.0,
    CompletionState.STARTED: 0.25,
    CompletionState.PARTIAL: 0.5,
    CompletionState.IMPLEMENTED: 0.75,
    CompletionState.VERIFIED: 1.0,
}


class EvidenceType(StrEnum):
    BENCHMARK = "BENCHMARK"
    EXPERIMENT_REPORT = "EXPERIMENT_REPORT"
    RESEARCH_DOC = "RESEARCH_DOC"
    TEST_RESULT = "TEST_RESULT"
    FINDING = "FINDING"
    DEMO_RECORDING = "DEMO_RECORDING"
    REPOSITORY = "REPOSITORY"
    OTHER = "OTHER"


class ResourceType(StrEnum):
    PAPER = "PAPER"
    DOCUMENT = "DOCUMENT"
    ARCHITECTURE_NOTE = "ARCHITECTURE_NOTE"
    REPOSITORY = "REPOSITORY"
    EXPERIMENT_REPORT = "EXPERIMENT_REPORT"
    DEMO = "DEMO"
    TECHNICAL_NOTE = "TECHNICAL_NOTE"
    EXTERNAL_LINK = "EXTERNAL_LINK"
