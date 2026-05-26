"""Hierarchy validation for work items.

Mirrors the rules encoded on the frontend in
``app/src/lib/hierarchy/validateReparent.ts``. The frontend is the spec; this
module is the enforcement layer that protects the API against direct callers
that bypass the form.

Canonical model (Story / Task / Bug are siblings directly under Epic; Subtask
sits one level below them):

    Epic            no epic_id, no parent_id
    User Story      epic_id -> Epic (optional), no parent_id
    Task            epic_id -> Epic (optional), no parent_id
    Bug             epic_id -> Epic (optional), no parent_id
    Subtask         no epic_id, parent_id -> Story/Task/Bug (required)

Subtasks reach their epic transitively via their parent (story/task/bug).
They do not carry their own epic_id link — that keeps the relationship as a
clean tree.

Cross-cutting rules:
    - Parent must exist and live in the same project
    - No self-parent
    - Depth-1 cap on parent_id: parent_id target must itself have no
      parent_id, and an item that already has children cannot itself be
      given a parent_id. With Subtask as the only parent_id user this caps
      the tree at depth 2 (Epic -> Story/Task/Bug -> Subtask).
"""

from fastapi import HTTPException
from sqlalchemy.orm import Session

from models.work_item import WorkItem, WorkItemType

# Allowed values for each (relationship, child_type) pair. Keys absent from the
# inner dict mean "this type cannot have this relationship at all".
ALLOWED_PARENT_TYPES: dict[str, dict[str, tuple[str, ...]]] = {
    "epic_id": {
        WorkItemType.USER_STORY.value: (WorkItemType.EPIC.value,),
        WorkItemType.TASK.value: (WorkItemType.EPIC.value,),
        WorkItemType.BUG.value: (WorkItemType.EPIC.value,),
        WorkItemType.EPIC.value: (),
        # Subtasks reach their epic indirectly through their parent
        # (story/task/bug). They do not carry their own epic_id link.
        WorkItemType.SUBTASK.value: (),
    },
    "parent_id": {
        WorkItemType.TASK.value: (),
        WorkItemType.USER_STORY.value: (),
        WorkItemType.BUG.value: (),
        WorkItemType.EPIC.value: (),
        WorkItemType.SUBTASK.value: (
            WorkItemType.USER_STORY.value,
            WorkItemType.TASK.value,
            WorkItemType.BUG.value,
        ),
    },
}


def _reject(field: str, code: str, message: str) -> None:
    raise HTTPException(
        status_code=422,
        detail={"field": field, "code": code, "message": message},
    )


def _check_link(
    db: Session,
    *,
    field: str,
    child_type: str,
    child_id: int | None,
    target_id: int | None,
    project_id: int,
) -> None:
    """Validate a single epic_id or parent_id assignment."""
    if target_id is None:
        return

    allowed = ALLOWED_PARENT_TYPES[field].get(child_type, ())
    if not allowed:
        _reject(
            field,
            "type_disallowed",
            f"{child_type} cannot have a {field}.",
        )

    if child_id is not None and target_id == child_id:
        _reject(field, "self_parent", "An item cannot be its own parent.")

    target = db.query(WorkItem).filter(WorkItem.id == target_id).first()
    if not target:
        _reject(field, "parent_not_found", f"Referenced {field} does not exist.")

    if target.project_id != project_id:
        _reject(
            field,
            "cross_project",
            f"Referenced {field} belongs to a different project.",
        )

    if target.type not in allowed:
        _reject(
            field,
            "parent_type_invalid",
            f"{child_type} cannot have a {target.type} as {field} (allowed: {', '.join(allowed)}).",
        )

    # Depth-1: only enforced for parent_id. epic_id is a single hop by design
    # (epics have no parent themselves, enforced by the type rule above).
    if field == "parent_id" and target.parent_id is not None:
        _reject(
            "parent_id",
            "depth_exceeded",
            "Cannot nest more than one level deep — the chosen parent is "
            "itself a child of another item.",
        )


def _check_no_children_if_becoming_child(
    db: Session,
    *,
    child_id: int | None,
    new_parent_id: int | None,
) -> None:
    """Reject setting parent_id on an item that already has its own children.

    This is the other half of the depth-1 rule: without it, an item with
    subtasks could be re-parented, creating a depth-2 chain via the children.
    """
    if child_id is None or new_parent_id is None:
        return

    has_children = db.query(WorkItem.id).filter(WorkItem.parent_id == child_id).first() is not None
    if has_children:
        _reject(
            "parent_id",
            "has_children",
            "Cannot give this item a parent because it already has children "
            "(would exceed the one-level nesting limit).",
        )


def validate_hierarchy(
    db: Session,
    *,
    item_type: str,
    project_id: int,
    parent_id: int | None,
    epic_id: int | None,
    item_id: int | None = None,
) -> None:
    """Raise HTTPException(422) if the hierarchy assignment is invalid.

    Args:
        db: SQLAlchemy session.
        item_type: The work item's type after the proposed change.
        project_id: Project the item belongs to.
        parent_id: Proposed parent_id (None to clear).
        epic_id: Proposed epic_id (None to clear).
        item_id: The item's own id, when updating. None on create.
    """
    if item_type not in {t.value for t in WorkItemType}:
        _reject("type", "type_unknown", f"Unknown work item type: {item_type}.")

    _check_link(
        db,
        field="epic_id",
        child_type=item_type,
        child_id=item_id,
        target_id=epic_id,
        project_id=project_id,
    )
    _check_link(
        db,
        field="parent_id",
        child_type=item_type,
        child_id=item_id,
        target_id=parent_id,
        project_id=project_id,
    )
    _check_no_children_if_becoming_child(db, child_id=item_id, new_parent_id=parent_id)
