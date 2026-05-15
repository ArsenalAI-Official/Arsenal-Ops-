"""
Role Model - RBAC roles and capability grants.

A user can have many roles (user_roles join). Each role has many capability
grants (role_capabilities). A user's effective capability set is the union
of all grants from all assigned roles.
"""
from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Table
from sqlalchemy.orm import relationship
from datetime import datetime

import sys
sys.path.append('..')
from database import Base


user_roles = Table(
    'user_roles',
    Base.metadata,
    Column('user_id', Integer, ForeignKey('users.id', ondelete='CASCADE'), primary_key=True),
    Column('role_id', Integer, ForeignKey('roles.id', ondelete='CASCADE'), primary_key=True),
    Column('assigned_at', DateTime, default=datetime.utcnow, nullable=False),
)


class Role(Base):
    __tablename__ = "roles"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(64), nullable=False, unique=True, index=True)
    description = Column(String(255), nullable=True)
    is_system = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    capabilities = relationship(
        "RoleCapability",
        back_populates="role",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )

    users = relationship(
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

    role_id = Column(
        Integer,
        ForeignKey('roles.id', ondelete='CASCADE'),
        primary_key=True,
    )
    capability_key = Column(String(128), primary_key=True)

    role = relationship("Role", back_populates="capabilities")

    def __repr__(self) -> str:
        return f"<RoleCapability role_id={self.role_id} key={self.capability_key}>"
