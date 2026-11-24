from fastapi import Header

DEFAULT_ACTOR = "demo-user"


def actor(x_actor: str | None = Header(default=None)) -> str:
    """No auth yet: the acting user is passed in the X-Actor header and set from Settings in the UI."""
    return (x_actor or DEFAULT_ACTOR).strip()[:120] or DEFAULT_ACTOR
