"""Shared helpers for router modules."""

from fastapi import HTTPException
from sqlalchemy.orm import Session


def get_or_404(db: Session, model, pk, *, detail: str | None = None, **extra_filters):
    """Fetch a single row by primary key, raising 404 if it doesn't exist.

    Mirrors the ubiquitous
    ``obj = db.query(Model).filter(Model.id == pk).first()`` +
    ``if not obj: raise HTTPException(404, ...)`` pattern, preserving its exact
    semantics (a real query with ``.first()``, not identity-map ``Session.get``).

    Extra equality filters can be passed as keywords to cover ownership-scoped
    lookups, e.g. ``get_or_404(db, PersonalTask, task_id, user_id=user.id)``.
    Pass ``detail`` to keep a caller's specific 404 message; otherwise it
    defaults to ``"<Model> not found"``.
    """
    query = db.query(model).filter(model.id == pk)
    for field, value in extra_filters.items():
        query = query.filter(getattr(model, field) == value)
    obj = query.first()
    if obj is None:
        raise HTTPException(status_code=404, detail=detail or f"{model.__name__} not found")
    return obj
