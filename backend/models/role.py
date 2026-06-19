"""
Role Model - RBAC roles and capability grants.

A user can have many roles (user_roles join). Each role has many capability
grants (role_capabilities). A user's effective capability set is the union
of all grants from all assigned roles.
"""

import sys
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Table
from sqlalchemy.orm import Mapped, mapped_column, relationship

sys.path.append("..")
from database import Base

if TYPE_CHECKING:
    from models.user import User

user_roles = Table(
    "user_roles",
    Base.metadata,
    Column("user_id", Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
    Column("role_id", Integer, ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True),
    Column("assigned_at", DateTime, default=datetime.utcnow, nullable=False),
)


class Role(Base):
    __tablename__ = "roles"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    description: Mapped[str | None] = mapped_column(String(255))
    is_system: Mapped[bool] = mapped_column(default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    capabilities: Mapped[list["RoleCapability"]] = relationship(
        "RoleCapability",
        back_populates="role",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )

    users: Mapped[list["User"]] = relationship(
        "User",
        secondary=user_roles,
        back_populates="roles",
    )

    def capability_keys(self) -> list[str]:
        return sorted({rc.capability_key for rc in self.capabilities})

    def __repr__(self) -> str:
        return f"<Role {self.name}>"


class RoleCapability(Base):
    __tablename__ = "role_capabilities"

    role_id: Mapped[int] = mapped_column(
        ForeignKey("roles.id", ondelete="CASCADE"),
        primary_key=True,
    )
    capability_key: Mapped[str] = mapped_column(String(128), primary_key=True)

    role: Mapped["Role"] = relationship("Role", back_populates="capabilities")

    def __repr__(self) -> str:
        return f"<RoleCapability role_id={self.role_id} key={self.capability_key}>"
