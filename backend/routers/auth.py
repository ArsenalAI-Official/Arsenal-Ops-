"""
Authentication Router - Login, logout, password management, Google SSO
"""

import hashlib
import os
import secrets
import string
import sys
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from jose import JWTError, jwt
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

sys.path.append("..")
from capabilities import CAPABILITIES, is_valid_grant
from database import get_db
from models.role import Role
from models.user import User, UserRole
from services.google_oauth_service import google_oauth_service

router = APIRouter(prefix="/api/auth", tags=["Authentication"])

# Security configuration
SECRET_KEY = "your-secret-key-change-in-production"  # Change this in production!
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24  # 24 hours

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


# Pydantic models
class UserCreate(BaseModel):
    email: str
    name: str
    role: str = "developer"


class UserResponse(BaseModel):
    id: int
    email: str
    name: str
    role: str
    is_first_login: bool


class PasswordChange(BaseModel):
    current_password: str
    new_password: str


class Token(BaseModel):
    access_token: str
    token_type: str
    user: UserResponse


class PasswordReset(BaseModel):
    user_id: int
    new_password: str


class GoogleLoginRequest(BaseModel):
    """Request model for Google SSO login"""

    token: str  # Google ID token from frontend


def generate_temp_password(length=12):
    """Generate a secure temporary password"""
    alphabet = string.ascii_letters + string.digits + "!@#$%^&*"
    return "".join(secrets.choice(alphabet) for _ in range(length))


def verify_password(plain_password, hashed_password):
    """Verify password using SHA256 hash"""
    hashed_input = hashlib.sha256(plain_password.encode()).hexdigest()
    return hashed_input == hashed_password


def get_password_hash(password):
    """Hash password using SHA256"""
    return hashlib.sha256(password.encode()).hexdigest()


def create_access_token(data: dict, expires_delta: timedelta | None = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception from None

    user = db.query(User).filter(User.id == int(user_id)).first()
    if user is None:
        raise credentials_exception
    return user


def get_current_admin(current_user: User = Depends(get_current_user)):
    # Check if user has admin role (roles are comma-separated)
    if "admin" not in current_user.role:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return current_user


def require_capability(cap: str):
    """
    FastAPI dependency factory: 403s unless the caller's effective capabilities
    cover `cap`. Returns the User on success so handlers can keep using
    `current_user: User = Depends(...)`.

    Usage:
        @router.post("/pulse-settings",
                     dependencies=[Depends(require_capability("project.pulse.settings"))])
        async def write(...): ...

    or capture the user:
        @router.post("/pulse-settings")
        async def write(current_user: User = Depends(require_capability("project.pulse.settings"))):
            ...
    """

    def _check(current_user: User = Depends(get_current_user)) -> User:
        if not current_user.has_capability(cap):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Missing required capability: {cap}",
            )
        return current_user

    return _check


@router.post("/login", response_model=Token)
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    """Login with email and password"""
    user = db.query(User).filter(User.email == form_data.username).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is disabled")

    # Update last login
    user.last_login_at = datetime.utcnow()
    db.commit()

    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": str(user.id)}, expires_delta=access_token_expires
    )

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "email": user.email,
            "name": user.name,
            "role": user.role,
            "is_first_login": user.is_first_login,
        },
    }


@router.post("/change-password")
def change_password(
    password_data: PasswordChange,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Change password (required on first login)"""
    # Verify current password
    if not verify_password(password_data.current_password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Current password is incorrect"
        )

    # Update password
    current_user.hashed_password = get_password_hash(password_data.new_password)
    current_user.is_first_login = False
    current_user.password_changed_at = datetime.utcnow()
    db.commit()

    return {"status": "success", "message": "Password changed successfully"}


@router.post("/admin/create-user", response_model=dict)
def create_user(
    user_data: UserCreate,
    admin: User = Depends(require_capability("admin.users")),
    db: Session = Depends(get_db),
):
    """Admin: Create a new user with auto-generated password"""
    from models.developer import Developer

    # Check if email already exists
    existing = db.query(User).filter(User.email == user_data.email).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered"
        )

    # Generate temporary password
    temp_password = generate_temp_password()

    # Create user
    new_user = User(
        email=user_data.email,
        name=user_data.name,
        hashed_password=get_password_hash(temp_password),
        role=user_data.role,
        is_first_login=True,
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    # If user has developer role, also create them as a Developer/Employee
    if "developer" in user_data.role:
        # Check if developer already exists with this email
        existing_dev = db.query(Developer).filter(Developer.email == user_data.email).first()
        if not existing_dev:
            new_developer = Developer(name=user_data.name, email=user_data.email)
            db.add(new_developer)
            db.commit()

    return {
        "status": "success",
        "message": "User created successfully",
        "user": {
            "id": new_user.id,
            "email": new_user.email,
            "name": new_user.name,
            "role": new_user.role,
        },
        "temporary_password": temp_password,
        "note": "Please share this password securely with the user. They will be required to change it on first login.",
    }


@router.get("/admin/users", response_model=list)
def list_users(
    admin: User = Depends(require_capability("admin.users")),
    db: Session = Depends(get_db),
):
    """Admin: List all users"""
    users = db.query(User).all()
    return [user.to_dict() for user in users]


@router.post("/admin/reset-password")
def admin_reset_password(
    reset_data: PasswordReset,
    admin: User = Depends(require_capability("admin.users")),
    db: Session = Depends(get_db),
):
    """Admin: Reset a user's password"""
    user = db.query(User).filter(User.id == reset_data.user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    user.hashed_password = get_password_hash(reset_data.new_password)
    user.is_first_login = True  # Force password change
    db.commit()

    return {
        "status": "success",
        "message": f"Password reset for {user.email}. They must change it on next login.",
    }


class RoleUpdate(BaseModel):
    role: str


@router.put("/admin/users/{user_id}/role")
def update_user_role(
    user_id: int,
    role_data: RoleUpdate,
    admin: User = Depends(require_capability("admin.roles")),
    db: Session = Depends(get_db),
):
    """Admin: Update a user's role"""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    # Prevent removing the last admin
    if "admin" in user.role and "admin" not in role_data.role:
        # Count users with admin role (roles are comma-separated)
        all_users = db.query(User).all()
        admin_count = sum(1 for u in all_users if "admin" in u.role)
        if admin_count <= 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot remove the last admin"
            )

    user.role = role_data.role
    db.commit()

    return {
        "status": "success",
        "message": f"User role updated to {role_data.role}",
        "user": user.to_dict(),
    }


@router.delete("/admin/users/{user_id}")
@router.delete("/admin/users/{user_id}/")  # Support trailing slash
def delete_user(
    user_id: int,
    admin: User = Depends(require_capability("admin.users")),
    db: Session = Depends(get_db),
):
    """Admin: Delete a user permanently"""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    # Prevent deleting yourself
    if user.id == admin.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot delete your own account"
        )

    # Prevent deleting the last admin
    if "admin" in user.role:
        # Count users with admin role (roles are comma-separated)
        all_users = db.query(User).all()
        admin_count = sum(1 for u in all_users if "admin" in u.role)
        if admin_count <= 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot delete the last admin"
            )

    # Hard delete - remove from database
    db.delete(user)
    db.commit()

    return {"status": "success", "message": f"User {user.email} has been permanently deleted"}


@router.get("/me", response_model=UserResponse)
def get_current_user_info(current_user: User = Depends(get_current_user)):
    """Get current user info"""
    return {
        "id": current_user.id,
        "email": current_user.email,
        "name": current_user.name,
        "role": current_user.role,
        "is_first_login": current_user.is_first_login,
    }


@router.post("/google-login", response_model=Token)
def google_login(request: GoogleLoginRequest, db: Session = Depends(get_db)):
    """
    Google SSO Login Endpoint

    OAuth 2.0 Flow:
    1. Frontend gets ID token from Google Sign-In
    2. Frontend sends token to this endpoint
    3. Backend verifies token with Google
    4. Backend creates/updates user in database
    5. Backend returns JWT access token
    6. Frontend stores JWT and uses for subsequent requests
    """
    from models.developer import Developer

    # Verify the Google ID token
    user_info = google_oauth_service.verify_token(request.token)
    if not user_info:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid Google token")

    # Domain-based access control:
    # - Internal domains (e.g., arsenalai.com) can sign in via SSO and are auto-provisioned.
    # - Any other domain may sign in only if an admin has pre-registered the user.
    allowed_domains = [
        d.strip().lower()
        for d in os.getenv("ALLOWED_EMAIL_DOMAINS", "arsenalai.com").split(",")
        if d.strip()
    ]
    email_domain = user_info["email"].split("@")[-1].lower()
    is_internal_domain = email_domain in allowed_domains

    # Check if user already exists by email
    user = db.query(User).filter(User.email == user_info["email"]).first()

    if not user and not is_internal_domain:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This Google account is not authorized. Ask an admin to add your account before signing in.",
        )

    if user:
        # Existing user - verify account is active
        if not user.is_active:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is disabled")

        # Ensure existing user has a Developer record (for users created before SSO feature)
        existing_dev = db.query(Developer).filter(Developer.email == user_info["email"]).first()
        if not existing_dev:
            new_developer = Developer(name=user.name, email=user.email)
            db.add(new_developer)
            db.commit()
    else:
        # Create new user from Google SSO
        user = User(
            email=user_info["email"],
            name=user_info["name"],
            hashed_password="",  # SSO users have no password (empty string works with or without NOT NULL)
            role=UserRole.DEVELOPER.value,
            is_active=True,
            is_first_login=False,  # SSO users don't need password change
            last_login_at=datetime.utcnow(),
        )
        db.add(user)
        db.commit()
        db.refresh(user)

        # Also create as Developer/Employee - ensure this always happens
        try:
            existing_dev = db.query(Developer).filter(Developer.email == user_info["email"]).first()
            if not existing_dev:
                new_developer = Developer(name=user_info["name"], email=user_info["email"])
                db.add(new_developer)
                db.commit()
        except Exception as dev_error:
            db.rollback()
            print(
                f"Warning: Failed to create developer record for {user_info['email']}: {dev_error}"
            )
            # Continue anyway - user account was created successfully

    # Update last login timestamp
    user.last_login_at = datetime.utcnow()
    db.commit()
    db.refresh(user)

    # Generate JWT token (same as password login)
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": str(user.id)}, expires_delta=access_token_expires
    )

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "email": user.email,
            "name": user.name,
            "role": user.role,
            "is_first_login": user.is_first_login,
        },
    }


@router.get("/google/config")
def get_google_config():
    """
    Get Google Client ID for frontend configuration
    Frontend needs this to initialize Google Sign-In
    """
    if not google_oauth_service.is_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Google SSO not configured"
        )

    return {"client_id": google_oauth_service.google_client_id}


@router.get("/dev-login/available")
def dev_login_available():
    """Lets the frontend decide whether to render the dev-login button."""
    return {"available": os.getenv("DEV_AUTH_BYPASS") == "1"}


@router.post("/dev-login", response_model=Token)
def dev_login(db: Session = Depends(get_db)):
    """Issue a JWT for a local admin user without going through Google SSO.

    Only enabled when DEV_AUTH_BYPASS=1 is set on the backend process. Idempotent:
    on first call, creates a `dev@local` admin (and the matching Developer record
    so the user shows up on boards); on subsequent calls, reuses it.
    """
    if os.getenv("DEV_AUTH_BYPASS") != "1":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")

    from models.developer import Developer

    user = db.query(User).filter(User.email == "dev@local").first()
    if not user:
        user = User(
            email="dev@local",
            name="Dev User",
            hashed_password=get_password_hash("dev"),  # unused, but column is non-null
            role=UserRole.ADMIN.value,
            is_active=True,
            is_first_login=False,
        )
        db.add(user)
        db.commit()
        db.refresh(user)

    if not db.query(Developer).filter(Developer.email == user.email).first():
        db.add(Developer(name=user.name, email=user.email))
        db.commit()

    user.last_login_at = datetime.utcnow()
    db.commit()

    access_token = create_access_token(
        data={"sub": str(user.id)},
        expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
    )
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "email": user.email,
            "name": user.name,
            "role": user.role,
            "is_first_login": user.is_first_login,
        },
    }


# ============= RBAC: Roles & Capabilities =============


class RoleCreateRequest(BaseModel):
    name: str
    description: str | None = None
    capability_keys: list[str] = []


class RoleUpdateRequest(BaseModel):
    name: str | None = None
    description: str | None = None


class RoleCapabilitiesRequest(BaseModel):
    capability_keys: list[str]


def _role_to_dict(role: Role, user_count: int | None = None) -> dict:
    out = {
        "id": role.id,
        "name": role.name,
        "description": role.description,
        "is_system": role.is_system,
        "capability_keys": role.capability_keys(),
        "created_at": role.created_at.isoformat() if role.created_at else None,
        "updated_at": role.updated_at.isoformat() if role.updated_at else None,
    }
    if user_count is not None:
        out["user_count"] = user_count
    return out


def _sync_legacy_role_column(user: User) -> None:
    """Keep users.role comma-string in sync with user.roles so existing checks keep working."""
    names = sorted({r.name for r in user.roles})
    user.role = ",".join(names) if names else "developer"


def _validate_grants_or_400(keys: list[str]) -> list[str]:
    cleaned: list[str] = []
    seen: set[str] = set()
    for raw in keys:
        key = (raw or "").strip()
        if not key or key in seen:
            continue
        if not is_valid_grant(key):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Unknown capability key: {key}",
            )
        seen.add(key)
        cleaned.append(key)
    return cleaned


@router.get("/capabilities")
async def list_capabilities(current_user: User = Depends(get_current_user)):
    """Return the static capability registry. Used by the admin role-edit UI."""
    return [{"key": k, "description": v} for k, v in CAPABILITIES.items()]


@router.get("/me/capabilities")
async def get_my_capabilities(current_user: User = Depends(get_current_user)):
    """Effective capability set for the calling user (union over their roles)."""
    return {
        "roles": [r.name for r in current_user.roles],
        "capabilities": current_user.effective_capability_keys(),
    }


@router.get("/admin/roles")
async def list_roles(
    db: Session = Depends(get_db), current_user: User = Depends(require_capability("admin.roles"))
):
    from models.role import user_roles as ur_table

    roles = db.query(Role).order_by(Role.is_system.desc(), Role.name.asc()).all()
    rows = (
        db.query(ur_table.c.role_id, func.count(ur_table.c.user_id))
        .group_by(ur_table.c.role_id)
        .all()
    )
    counts = {rid: c for rid, c in rows}
    return [_role_to_dict(r, user_count=counts.get(r.id, 0)) for r in roles]


@router.post("/admin/roles", status_code=status.HTTP_201_CREATED)
async def create_role(
    req: RoleCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_capability("admin.roles")),
):
    from models.role import RoleCapability

    name = req.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Role name is required")
    if db.query(Role).filter(Role.name == name).first():
        raise HTTPException(status_code=400, detail="Role with this name already exists")

    cleaned_keys = _validate_grants_or_400(req.capability_keys)

    role = Role(name=name, description=(req.description or None), is_system=False)
    role.capabilities = [RoleCapability(capability_key=k) for k in cleaned_keys]
    db.add(role)
    db.commit()
    db.refresh(role)
    return _role_to_dict(role, user_count=0)


@router.get("/admin/roles/{role_id}")
async def get_role(
    role_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_capability("admin.roles")),
):
    role = db.query(Role).filter(Role.id == role_id).first()
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
    return _role_to_dict(role, user_count=len(role.users))


@router.put("/admin/roles/{role_id}")
async def update_role(
    role_id: int,
    req: RoleUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_capability("admin.roles")),
):
    role = db.query(Role).filter(Role.id == role_id).first()
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")

    if req.name is not None:
        new_name = req.name.strip()
        if not new_name:
            raise HTTPException(status_code=400, detail="Role name cannot be empty")
        if role.is_system and new_name != role.name:
            raise HTTPException(status_code=400, detail="Cannot rename a system role")
        if new_name != role.name and db.query(Role).filter(Role.name == new_name).first():
            raise HTTPException(status_code=400, detail="Role with this name already exists")
        role.name = new_name

    if req.description is not None:
        role.description = req.description.strip() or None

    db.commit()
    db.refresh(role)

    # If we renamed, refresh legacy column on every assigned user
    if req.name is not None:
        for u in role.users:
            _sync_legacy_role_column(u)
        db.commit()

    return _role_to_dict(role, user_count=len(role.users))


@router.delete("/admin/roles/{role_id}")
async def delete_role(
    role_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_capability("admin.roles")),
):
    role = db.query(Role).filter(Role.id == role_id).first()
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
    if role.is_system:
        raise HTTPException(status_code=400, detail="Cannot delete a system role")

    affected_users = list(role.users)
    db.delete(role)
    db.commit()

    for u in affected_users:
        db.refresh(u)
        _sync_legacy_role_column(u)
    db.commit()

    return {"message": "Role deleted"}


@router.put("/admin/roles/{role_id}/capabilities")
async def replace_role_capabilities(
    role_id: int,
    req: RoleCapabilitiesRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_capability("admin.roles")),
):
    from models.role import RoleCapability

    role = db.query(Role).filter(Role.id == role_id).first()
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")

    cleaned_keys = _validate_grants_or_400(req.capability_keys)

    # Replace the entire set in one go
    role.capabilities = [RoleCapability(capability_key=k) for k in cleaned_keys]
    db.commit()
    db.refresh(role)
    return _role_to_dict(role, user_count=len(role.users))


@router.get("/admin/users/{user_id}/roles")
async def get_user_roles(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_capability("admin.roles")),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return [_role_to_dict(r) for r in user.roles]


@router.post("/admin/users/{user_id}/roles/{role_id}", status_code=status.HTTP_201_CREATED)
async def assign_role_to_user(
    user_id: int,
    role_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_capability("admin.roles")),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    role = db.query(Role).filter(Role.id == role_id).first()
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")

    if role in user.roles:
        raise HTTPException(status_code=400, detail="Role already assigned to user")

    user.roles.append(role)
    _sync_legacy_role_column(user)
    db.commit()
    return {"message": "Role assigned", "roles": [r.name for r in user.roles]}


@router.delete("/admin/users/{user_id}/roles/{role_id}")
async def remove_role_from_user(
    user_id: int,
    role_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_capability("admin.roles")),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    role = db.query(Role).filter(Role.id == role_id).first()
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")

    if role not in user.roles:
        raise HTTPException(status_code=400, detail="Role not assigned to user")

    user.roles.remove(role)
    _sync_legacy_role_column(user)
    db.commit()
    return {"message": "Role removed", "roles": [r.name for r in user.roles]}
