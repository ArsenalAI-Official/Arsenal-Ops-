"""
User Model - Authentication and user management
"""

import enum
import sys
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

sys.path.append("..")
from database import Base

if TYPE_CHECKING:
    from models.personal_task import PersonalTask
    from models.role import Role


class UserRole(str, enum.Enum):  # noqa: UP042
    ADMIN = "admin"
    PROJECT_MANAGER = "project_manager"
    DEVELOPER = "developer"


def has_role(user_role: str, required_role: str) -> bool:
    """Check if user has a specific role (supports multiple roles)"""
    if not user_role:
        return False
    roles = [r.strip() for r in user_role.split(",")]
    return required_role in roles


def has_any_role(user_role: str, required_roles: list) -> bool:
    """Check if user has any of the required roles"""
    if not user_role:
        return False
    roles = [r.strip() for r in user_role.split(",")]
    return any(role in roles for role in required_roles)


class User(Base):
    """User account for authentication"""

    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(255))
    hashed_password: Mapped[str | None] = mapped_column(String(255))  # Nullable for SSO users
    # Nullable in the DB (legacy default) and the reconcile paths legitimately
    # read/clear it, so it stays Optional despite the default.
    role: Mapped[str | None] = mapped_column(
        String(255), default=UserRole.DEVELOPER.value
    )  # Supports comma-separated roles

    # Account status
    is_active: Mapped[bool] = mapped_column(default=True, nullable=True)
    is_first_login: Mapped[bool] = mapped_column(
        default=True, nullable=True
    )  # Must change password on first login

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=True
    )
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime)
    password_changed_at: Mapped[datetime | None] = mapped_column(DateTime)

    # Relationships
    personal_tasks: Mapped[list["PersonalTask"]] = relationship(
        "PersonalTask", back_populates="user", cascade="all, delete-orphan"
    )
    roles: Mapped[list["Role"]] = relationship(
        "Role",
        secondary="user_roles",
        back_populates="users",
    )

    def effective_capability_keys(self) -> list[str]:
        """Union of every grant from every assigned role."""
        keys: set[str] = set()
        for r in self.roles:
            for rc in r.capabilities:
                keys.add(rc.capability_key)
        return sorted(keys)

    def has_capability(self, key: str) -> bool:
        from capabilities import matches

        return matches(key, self.effective_capability_keys())

    def has_role_named(self, name: str) -> bool:
        return any(r.name == name for r in self.roles)

    def to_dict(self):
        return {
            "id": self.id,
            "email": self.email,
            "name": self.name,
            "role": self.role,
            "is_active": self.is_active,
            "is_first_login": self.is_first_login,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "last_login_at": self.last_login_at.isoformat() if self.last_login_at else None,
        }
