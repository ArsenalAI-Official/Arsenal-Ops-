"""Comment model - Comments and activity on work items with @mentions"""

import sys
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import JSON, DateTime, ForeignKey, Index, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

sys.path.append("..")
from database import Base

if TYPE_CHECKING:
    from models.developer import Developer
    from models.work_item import WorkItem


class Comment(Base):
    __tablename__ = "comments"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    work_item_id: Mapped[int] = mapped_column(
        ForeignKey("work_items.id", ondelete="CASCADE"), index=True
    )
    author_id: Mapped[int | None] = mapped_column(
        ForeignKey("developers.id", ondelete="SET NULL"), index=True
    )

    # Comment content
    content: Mapped[str] = mapped_column(Text)

    # @mentions - list of developer IDs that were mentioned
    mentions: Mapped[list[int]] = mapped_column(JSON, default=list, nullable=True)

    # Type: comment, blocker, update
    comment_type: Mapped[str] = mapped_column(
        String(20), default="comment", nullable=True
    )  # comment, blocker, status_change, business_review

    # Resolution status for business review comments
    is_resolved: Mapped[bool] = mapped_column(default=False, nullable=True)

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    # Relationships
    work_item: Mapped["WorkItem"] = relationship("WorkItem", back_populates="comments")
    author: Mapped["Developer | None"] = relationship("Developer", back_populates="comments")

    # Indexes
    __table_args__ = (Index("idx_comment_workitem", "work_item_id", "created_at"),)
