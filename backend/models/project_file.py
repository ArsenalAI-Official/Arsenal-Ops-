"""
ProjectFile Model - Represents uploaded files for projects
"""

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base

if TYPE_CHECKING:
    from models.project import Project
    from models.user import User


class ProjectFile(Base):
    __tablename__ = "project_files"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    project_id: Mapped[int] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True
    )
    file_name: Mapped[str] = mapped_column(String)
    file_size: Mapped[int] = mapped_column()  # Size in bytes
    file_type: Mapped[str] = mapped_column(String)  # MIME type
    file_url: Mapped[str] = mapped_column(String)  # URL or path to download
    uploaded_by: Mapped[int] = mapped_column(ForeignKey("users.id"))  # User ID who uploaded
    uploaded_by_name: Mapped[str] = mapped_column(String)  # Email/name of uploader
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)

    # Relationships
    project: Mapped["Project"] = relationship("Project", foreign_keys=[project_id])
    uploader: Mapped["User"] = relationship("User", foreign_keys=[uploaded_by])

    def __repr__(self):
        return f"<ProjectFile {self.file_name} (project_id={self.project_id})>"
