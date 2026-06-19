"""WorkItemAssignmentHistory model - audit trail of which developer held a work item
between which timestamps. Used to attribute capacity correctly when tickets are
transferred between developers within a week."""

import sys
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship

sys.path.append("..")
from database import Base

if TYPE_CHECKING:
    from models.developer import Developer
    from models.work_item import WorkItem


class WorkItemAssignmentHistory(Base):
    __tablename__ = "work_item_assignment_history"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    work_item_id: Mapped[int] = mapped_column(
        ForeignKey("work_items.id", ondelete="CASCADE"), index=True
    )
    developer_id: Mapped[int | None] = mapped_column(
        ForeignKey("developers.id", ondelete="SET NULL"), index=True
    )

    assigned_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    unassigned_at: Mapped[datetime | None] = mapped_column(DateTime)

    work_item: Mapped["WorkItem"] = relationship("WorkItem")
    developer: Mapped["Developer | None"] = relationship("Developer")

    __table_args__ = (
        Index("idx_wiah_work_item_assigned", "work_item_id", "assigned_at"),
        Index("idx_wiah_developer_assigned", "developer_id", "assigned_at"),
    )

    def to_dict(self):
        return {
            "id": self.id,
            "work_item_id": self.work_item_id,
            "developer_id": self.developer_id,
            "assigned_at": self.assigned_at.isoformat() if self.assigned_at else None,
            "unassigned_at": self.unassigned_at.isoformat() if self.unassigned_at else None,
        }
