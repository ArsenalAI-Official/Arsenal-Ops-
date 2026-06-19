"""TaskDependency model - Link tasks as blocking/blocked by other tasks"""

import sys
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Index, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

sys.path.append("..")
from database import Base

if TYPE_CHECKING:
    from models.work_item import WorkItem


class TaskDependency(Base):
    __tablename__ = "task_dependencies"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    work_item_id: Mapped[int] = mapped_column(
        ForeignKey("work_items.id", ondelete="CASCADE"), index=True
    )
    depends_on_id: Mapped[int] = mapped_column(
        ForeignKey("work_items.id", ondelete="CASCADE"), index=True
    )
    dependency_type: Mapped[str] = mapped_column(String(20), default="blocks")  # blocks, blocked_by

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    # Relationships
    work_item: Mapped["WorkItem"] = relationship(
        "WorkItem", foreign_keys=[work_item_id], back_populates="dependencies"
    )
    depends_on: Mapped["WorkItem"] = relationship(
        "WorkItem", foreign_keys=[depends_on_id], back_populates="blocked_by"
    )

    __table_args__ = (
        Index("idx_task_dependency_work_item", "work_item_id"),
        Index("idx_task_dependency_depends_on", "depends_on_id"),
    )

    def to_dict(self):
        return {
            "id": self.id,
            "work_item_id": self.work_item_id,
            "depends_on_id": self.depends_on_id,
            "dependency_type": self.dependency_type,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
