"""
User Model - Authentication and user management
"""
from sqlalchemy import Column, Integer, String, Boolean, DateTime, Enum
from sqlalchemy.orm import relationship
from datetime import datetime
import enum

import sys
sys.path.append('..')
from database import Base


class UserRole(str, enum.Enum):
    ADMIN = "admin"
    PROJECT_MANAGER = "project_manager"
    DEVELOPER = "developer"


def has_role(user_role: str, required_role: str) -> bool:
    """Check if user has a specific role (supports multiple roles)"""
    if not user_role:
        return False
    roles = [r.strip() for r in user_role.split(',')]
    return required_role in roles


def has_any_role(user_role: str, required_roles: list) -> bool:
    """Check if user has any of the required roles"""
    if not user_role:
        return False
    roles = [r.strip() for r in user_role.split(',')]
    return any(role in roles for role in required_roles)


class User(Base):
    """User account for authentication"""
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, nullable=False, index=True)
    name = Column(String(255), nullable=False)
    hashed_password = Column(String(255), nullable=True)  # Nullable for SSO users
    role = Column(String(255), default=UserRole.DEVELOPER.value)  # Supports comma-separated roles
    
    # Account status
    is_active = Column(Boolean, default=True)
    is_first_login = Column(Boolean, default=True)  # Must change password on first login
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    last_login_at = Column(DateTime, nullable=True)
    password_changed_at = Column(DateTime, nullable=True)
    
    # Relationships
    personal_tasks = relationship("PersonalTask", back_populates="user", cascade="all, delete-orphan")
    roles = relationship(
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
