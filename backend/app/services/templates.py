"""Default deliverable templates and their instantiation for new versions."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.enums import DeliverableCategory
from app.models import Deliverable, ProgressTemplate, TemplateItem

DEFAULT_CODE_ITEMS = [
    ("environment", "Environment and setup", 10),
    ("core", "Core implementation", 35),
    ("integration", "Integration", 20),
    ("testing", "Error handling and testing", 20),
    ("demo", "Reproducible runnable demo", 15),
]

DEFAULT_VALIDATION_ITEMS = [
    ("problem", "Problem statement and hypothesis", 10),
    ("feasibility", "Research and feasibility analysis", 15),
    ("experiments", "Experiment design and execution", 25),
    ("benchmarking", "Benchmarking and evaluation", 25),
    ("demonstration", "Demonstration and findings", 15),
    ("conclusion", "Technical conclusion", 10),
]


def ensure_default_templates(db: Session) -> None:
    existing = db.scalars(select(ProgressTemplate).where(ProgressTemplate.is_default)).all()
    have = {t.category for t in existing}
    for category, name, items in (
        (DeliverableCategory.CODE, "Default code deliverables", DEFAULT_CODE_ITEMS),
        (DeliverableCategory.VALIDATION, "Default validation deliverables", DEFAULT_VALIDATION_ITEMS),
    ):
        if category in have:
            continue
        t = ProgressTemplate(name=name, category=category, is_default=True)
        t.items = [
            TemplateItem(key=k, title=title, weight=w, position=i)
            for i, (k, title, w) in enumerate(items)
        ]
        db.add(t)
    db.flush()


def instantiate_deliverables(db: Session, version_id: str) -> list[Deliverable]:
    """Create fresh, NOT_STARTED deliverables from the default templates. Nothing is inherited."""
    ensure_default_templates(db)
    templates = db.scalars(
        select(ProgressTemplate)
        .where(ProgressTemplate.is_default)
        .order_by(ProgressTemplate.category)
    ).all()
    out = []
    pos = 0
    for t in sorted(templates, key=lambda t: 0 if t.category == DeliverableCategory.CODE else 1):
        for item in t.items:
            d = Deliverable(
                version_id=version_id,
                category=t.category,
                key=item.key,
                title=item.title,
                description=item.description,
                weight=item.weight,
                position=pos,
            )
            pos += 1
            db.add(d)
            out.append(d)
    db.flush()
    return out
