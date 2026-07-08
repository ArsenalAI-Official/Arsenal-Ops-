"""Activity logging helper — centralizes ActivityLog construction."""

from sqlalchemy.orm import Session

from models.activity_log import ActivityLog


def log_activity(
    db: Session,
    *,
    project_id,
    action,
    entity_type,
    title,
    user_id=None,
    entity_id=None,
    details=None,
    best_effort=False,
):
    activity = ActivityLog(
        project_id=project_id,
        user_id=user_id,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        title=title,
        details=details,
    )
    if best_effort:
        try:
            db.add(activity)
            db.commit()
        except Exception:
            db.rollback()
        return
    db.add(activity)
