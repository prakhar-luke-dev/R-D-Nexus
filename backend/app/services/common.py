from typing import Any

from sqlalchemy.orm import Session

from app.models import ActivityLog, Node


class DomainError(Exception):
    """A business-rule violation, mapped to an HTTP error by the API layer."""

    def __init__(self, message: str, status_code: int = 422, code: str = "rule_violation"):
        super().__init__(message)
        self.message = message
        self.status_code = status_code
        self.code = code


class NotFound(DomainError):
    def __init__(self, what: str):
        super().__init__(f"{what} not found", 404, "not_found")


def get_or_404[T](db: Session, model: type[T], key: Any, what: str | None = None) -> T:
    obj = db.get(model, key)
    if obj is None:
        raise NotFound(what or model.__name__)
    return obj


def log_activity(
    db: Session,
    *,
    team_id: str,
    actor: str,
    action: str,
    node: Node | None = None,
    description: str = "",
    old: dict | None = None,
    new: dict | None = None,
) -> ActivityLog:
    entry = ActivityLog(
        team_id=team_id,
        actor_id=actor,
        node_id=node.id if node else None,
        node_title=node.title if node else None,
        action=action,
        old_value=old,
        new_value=new,
        description=description,
    )
    db.add(entry)
    return entry
