"""
Project Overview Router - Bundles the data the project landing page used to
fetch via 7 separate API calls into a single response.

The frontend used to issue parallel calls to /projects/{id}, /sprints,
/goals, /milestones, /activity, /analytics, /prd/analysis, /links — each
incurring its own auth + DB round trip. This endpoint reuses the existing
helpers from each domain router so the serialization shape stays in lockstep
without copy-pasting query logic.

Failures in any sub-fetch are isolated: a broken analytics computation does
not blank the page; instead the caller sees an empty/null section and a
warning is logged server-side.
"""

import logging
import sys

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

sys.path.append("..")
from database import get_db
from models.user import User
from routers.auth import get_current_user

# Reuse the existing serialization + access-check helpers rather than
# duplicating the underlying query logic.
from routers.projects import (
    _favorite_project_ids,
    format_project,
    get_project_activity,
    get_project_goals,
    get_project_links,
    get_project_milestones,
    require_project_access,
)
from routers.workitems import get_project_analytics, list_project_sprints

router = APIRouter(prefix="/api/projects", tags=["Overview"])
logger = logging.getLogger(__name__)


def _safe(label: str, fn, fallback):
    """Run ``fn`` and return its result; on any error, log and return ``fallback``.

    Each sub-fetch is wrapped in this so that one broken section (e.g. a
    missing analytics column on a stale DB schema) doesn't break the whole
    overview page.
    """
    try:
        return fn()
    except Exception:
        logger.warning("[overview] %s sub-fetch failed", label, exc_info=True)
        return fallback


def _get_prd_analysis(project_id: int, db: Session):
    """Fetch the latest PRD analysis without triggering 404s.

    The existing /api/prd/projects/{id}/analysis handler returns None when no
    analysis exists, so we replicate that contract here.
    """
    from models.architecture import PRDAnalysis

    analysis = (
        db.query(PRDAnalysis)
        .filter(PRDAnalysis.project_id == project_id)
        .order_by(PRDAnalysis.created_at.desc())
        .first()
    )
    return analysis.to_dict() if analysis else None


@router.get("/{project_id}/overview")
def get_project_overview(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Bundle of the data the project landing page needs in a single request.

    Replaces the prior 7 parallel calls with one. Each sub-section falls back
    to a sensible empty value on error so the page still renders.
    """
    project = require_project_access(project_id, current_user, db)
    favorite_ids = _favorite_project_ids(current_user, db)

    return {
        "project": _safe("project", lambda: format_project(project, db, favorite_ids), None),
        "sprints": _safe(
            "sprints",
            lambda: list_project_sprints(project_id, db=db, current_user=current_user),
            [],
        ),
        "goals": _safe(
            "goals",
            lambda: get_project_goals(project_id, db=db, current_user=current_user),
            [],
        ),
        "milestones": _safe(
            "milestones",
            lambda: get_project_milestones(project_id, db=db, current_user=current_user),
            [],
        ),
        "activities": _safe(
            "activities",
            lambda: get_project_activity(project_id, limit=50, db=db, current_user=current_user),
            [],
        ),
        "analytics": _safe(
            "analytics",
            lambda: get_project_analytics(project_id, db=db, current_user=current_user),
            {},
        ),
        "prdAnalysis": _safe("prdAnalysis", lambda: _get_prd_analysis(project_id, db), None),
        "links": _safe(
            "links",
            lambda: get_project_links(project_id, db=db, user=current_user),
            [],
        ),
    }
