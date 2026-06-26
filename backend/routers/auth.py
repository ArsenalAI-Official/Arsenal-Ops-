"""
Authentication Router - Login, logout, password management, Google SSO
"""

import hashlib
import os
import secrets
import string
import sys
from datetime import datetime, timedelta
from threading import Lock

from cachetools import TTLCache
from fastapi import APIRouter, Depends, HTTPException, Response, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from jose import JWTError, jwt
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session, selectinload

sys.path.append("..")
from capabilities import CAPABILITIES, is_valid_grant
from database import _allowed_internal_domains, get_db
from models.role import Role
from models.user import User, UserRole
from services.google_oauth_service import google_oauth_service


def _is_internal_email(email: str | None) -> bool:
    """True if the email's domain is in ALLOWED_EMAIL_DOMAINS (case-insensitive).

    Shared by the Add User and SSO paths so they classify identically. The
    domain list itself lives in database._allowed_internal_domains as a single
    source of truth (the startup reconciliation in database.py uses the same
    list to decide who belongs in the Employees tab).
    """
    if not email or "@" not in email:
        return False
    return email.rsplit("@", 1)[-1].lower() in _allowed_internal_domains()


router = APIRouter(prefix="/api/auth", tags=["Authentication"])

# Security configuration
#
# SECRET_KEY is the symmetric HS256 key the app both signs and verifies JWTs
# with. It MUST come from the environment: because HS256 is symmetric, anyone
# who knows the key can forge a token for any user id (full auth bypass). The
# historical hardcoded default is public in source/history, so we refuse to
# start on an unset key or that legacy literal — fail closed.
_LEGACY_DEFAULT_SECRET_KEY = "your-secret-key-change-in-production"
_secret_key = os.getenv("SECRET_KEY")
if not _secret_key or _secret_key == _LEGACY_DEFAULT_SECRET_KEY:
    raise RuntimeError(
        "SECRET_KEY must be set in the environment to a non-default value. "
        "The app refuses to start on the legacy hardcoded default to avoid "
        "trivial JWT forgery. Set SECRET_KEY in .env (local) or the Render "
        "dashboard (prod). Note: changing it invalidates all live sessions."
    )
# Narrowed to `str` by the guard above so jwt.encode/decode get a concrete key.
SECRET_KEY: str = _secret_key
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24  # 24 hours

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

# In-process LRU cache for effective-capabilities responses. Keyed on
# (user_id, sorted role_id tuple) so any role assignment change for the user
# produces a different key and naturally bypasses the stale entry. Capability
# *content* changes on existing roles do NOT change the key, so the mutation
# endpoints below explicitly clear the cache.
_caps_cache: TTLCache = TTLCache(maxsize=1000, ttl=60)
_caps_lock = Lock()


def _invalidate_caps_cache() -> None:
    """Drop every entry in the effective-capabilities cache.

    Called by every endpoint that can change either (a) the set of roles a
    user holds, or (b) the capabilities attached to a role. We clear the
    whole cache rather than try to be surgical because (i) the cache is
    process-local and tiny, and (ii) mutations are rare relative to reads.
    """
    with _caps_lock:
        _caps_cache.clear()


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


class UserListItemResponse(BaseModel):
    """Rich admin user shape returned by GET /api/auth/admin/users.

    Mirrors User.to_dict() plus the github_username joined from the linked
    Developer row. Used for OpenAPI/TS typing only (no runtime serialization).
    """

    id: int
    email: str
    name: str
    role: str
    is_active: bool
    is_first_login: bool
    # Always present on a persisted user row (server-default timestamp); the
    # to_dict() `else None` guard is defensive only. Typed non-null so the
    # generated FE type doesn't force null-guards on a never-null field.
    created_at: str
    last_login_at: str | None = None
    github_username: str | None = None


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
        user_id: str | None = payload.get("sub")
        if user_id is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception from None

    user = (
        db.query(User)
        .options(selectinload(User.roles).selectinload(Role.capabilities))
        .filter(User.id == int(user_id))
        .first()
    )
    if user is None:
        raise credentials_exception
    return user


def _has_admin_role(user: User) -> bool:
    """Does this user hold the system 'admin' Role?

    Reads the many-to-many `user.roles` relationship instead of the legacy
    comma-separated `user.role` string. Used for last-admin-protection
    business rules below — not for permission decisions. Real permission
    checks go through `require_capability()` which inspects effective
    capabilities, not role names.
    """
    return any(r.name == "admin" for r in user.roles)


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
                detail="Do not have permission",
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
    admin: User = Depends(require_capability("admin.users_write")),
    db: Session = Depends(get_db),
):
    """Admin: Pre-register a user for Google SSO login.

    Everyone authenticates via Google SSO. Internal-domain emails are
    auto-provisioned on first SSO login and don't need this endpoint —
    it's primarily for authorizing external users (whose domains the SSO
    endpoint would otherwise reject) by creating the User row in advance.
    No password is issued; hashed_password is left null.
    """
    from models.developer import Developer

    # Check if email already exists
    existing = db.query(User).filter(User.email == user_data.email).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered"
        )

    # SSO-only: no password, no first-login dance.
    new_user = User(
        email=user_data.email,
        name=user_data.name,
        hashed_password=None,
        role=user_data.role,
        is_first_login=False,
    )
    db.add(new_user)
    # Flush (not commit) so new_user.id is populated for the m2m append
    # below, then commit user + roles in a single transaction.
    db.flush()

    # Link the new user to the corresponding system Role rows so they actually
    # hold the capabilities their role string implies. Without this, the user
    # has zero effective caps (has_capability reads user.roles, not user.role).
    _link_roles_from_string(new_user, user_data.role, db)
    db.commit()
    db.refresh(new_user)

    # Always create a Developer/Employee row regardless of role. is_external is
    # derived purely from the email domain: addresses on a configured internal
    # domain (ALLOWED_EMAIL_DOMAINS) are company employees and must show up in
    # the Employees tab even if their role doesn't include "developer";
    # everyone else is external and filtered out of that tab.
    existing_dev = db.query(Developer).filter(Developer.email == user_data.email).first()
    if not existing_dev:
        new_developer = Developer(
            name=user_data.name,
            email=user_data.email,
            is_external=not _is_internal_email(user_data.email),
        )
        db.add(new_developer)
        db.commit()

    return {
        "status": "success",
        "message": "User authorized. They can now sign in with Google SSO.",
        "user": {
            "id": new_user.id,
            "email": new_user.email,
            "name": new_user.name,
            "role": new_user.role,
        },
    }


@router.get("/admin/users", responses={200: {"model": list[UserListItemResponse]}})
def list_users(
    admin: User = Depends(require_capability("admin.users")),
    db: Session = Depends(get_db),
):
    """Admin: List all users (with github_username joined from linked Developer)."""
    from models.developer import Developer

    users = db.query(User).all()
    # Join developer rows in one pass (avoids N+1).
    devs = {d.email: d for d in db.query(Developer).all()}
    out = []
    for u in users:
        d = devs.get(u.email)
        out.append({**u.to_dict(), "github_username": d.github_username if d else None})
    return out


@router.post("/admin/reset-password")
def admin_reset_password(
    reset_data: PasswordReset,
    admin: User = Depends(require_capability("admin.users_write")),
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


class UserProfileUpdate(BaseModel):
    name: str | None = None
    email: str | None = None
    github_username: str | None = None


@router.put("/admin/users/{user_id}")
def update_user_profile(
    user_id: int,
    payload: UserProfileUpdate,
    admin: User = Depends(require_capability("admin.users_write")),
    db: Session = Depends(get_db),
):
    """Admin: Update a user's profile (name, email, GitHub username).

    Email changes are accepted but risky — the user's Google account must match
    the new email for SSO to keep working. github_username writes through to the
    linked Developer row if one exists; otherwise it's silently ignored.
    """
    from models.developer import Developer

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    old_email = user.email
    new_email = payload.email.strip() if payload.email is not None else None
    if new_email and new_email != old_email:
        # Block collisions on either side of the User/Developer split.
        if db.query(User).filter(User.email == new_email, User.id != user.id).first():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Another user already has that email",
            )
        if (
            db.query(Developer)
            .filter(Developer.email == new_email, Developer.email != old_email)
            .first()
        ):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Another developer record already has that email",
            )
        user.email = new_email

    if payload.name is not None:
        new_name = payload.name.strip()
        if not new_name:
            raise HTTPException(status_code=400, detail="Name cannot be empty")
        user.name = new_name

    # Keep the linked Developer row in sync. Match by the user's email BEFORE
    # commit so we find it even if we're about to change it.
    dev = db.query(Developer).filter(Developer.email == old_email).first()
    if dev:
        if payload.name is not None:
            dev.name = user.name
        if new_email and new_email != old_email:
            dev.email = new_email
        if payload.github_username is not None:
            cleaned = payload.github_username.strip() or None
            if cleaned and cleaned != dev.github_username:
                clash = (
                    db.query(Developer)
                    .filter(Developer.github_username == cleaned, Developer.id != dev.id)
                    .first()
                )
                if clash:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Another developer already uses that GitHub username",
                    )
            dev.github_username = cleaned

    db.commit()
    db.refresh(user)
    return {
        **user.to_dict(),
        "github_username": dev.github_username if dev else None,
    }


class RoleUpdate(BaseModel):
    role: str


@router.put("/admin/users/{user_id}/role")
def update_user_role(
    user_id: int,
    role_data: RoleUpdate,
    admin: User = Depends(require_capability("admin.roles_write")),
    db: Session = Depends(get_db),
):
    """Admin: Update a user's role"""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    # Resolve the requested string to known SYSTEM roles up front. This endpoint
    # sets a user's system role(s); custom roles are managed via the
    # assign/remove-role endpoints. Reject unknown names (e.g. a typo like
    # "superuser") and the empty string with 400 rather than silently writing
    # them to the legacy column while granting zero capabilities — RBAC reads
    # `user.roles`, not the string, so a silent no-op would look like success.
    requested_names = [n.strip() for n in (role_data.role or "").split(",") if n.strip()]
    resolved = {
        r.name: r
        for r in db.query(Role)
        .filter(Role.is_system.is_(True), Role.name.in_(requested_names))
        .all()
    }
    unknown = [n for n in requested_names if n not in resolved]
    if not requested_names or unknown:
        detail = (
            f"Unknown role(s): {', '.join(sorted(set(unknown)))}"
            if unknown
            else "A role is required"
        )
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=detail)

    # Prevent removing the last admin. Read the many-to-many `user.roles`
    # relationship rather than the legacy comma-string column, since RBAC is
    # the source of truth for "is this user an admin". Evaluated against the
    # CURRENT (pre-change) roles, before the resync below.
    is_demoting_admin = _has_admin_role(user) and "admin" not in resolved
    if is_demoting_admin:
        all_users = db.query(User).options(selectinload(User.roles)).all()
        admin_count = sum(1 for u in all_users if _has_admin_role(u))
        if admin_count <= 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot remove the last admin"
            )

    # Resync the RBAC m2m to the resolved system roles (preserving any custom,
    # non-system roles assigned via the RBAC UI), then derive the legacy column
    # FROM the resolved roles via `_sync_legacy_role_column` so the string can't
    # drift from the m2m. RBAC is authoritative; the legacy column is a mirror.
    desired_system_roles = [resolved[n] for n in dict.fromkeys(requested_names)]
    user.roles = [r for r in user.roles if not r.is_system] + desired_system_roles
    _sync_legacy_role_column(user)
    db.commit()
    _invalidate_caps_cache()

    return {
        "status": "success",
        "message": f"User role updated to {role_data.role}",
        "user": user.to_dict(),
    }


@router.delete("/admin/users/{user_id}")
@router.delete("/admin/users/{user_id}/")  # Support trailing slash
def delete_user(
    user_id: int,
    admin: User = Depends(require_capability("admin.users_write")),
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

    # Prevent deleting the last admin. Counts users whose `roles`
    # relationship includes the system 'admin' role, not the legacy
    # comma-separated `user.role` column.
    if _has_admin_role(user):
        all_users = db.query(User).options(selectinload(User.roles)).all()
        admin_count = sum(1 for u in all_users if _has_admin_role(u))
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
    is_internal_domain = _is_internal_email(user_info["email"])

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

        # Ensure existing user has a Developer record (for users created before SSO feature).
        # is_external derives from the email domain: anyone on an allowed internal
        # domain is a company employee; everyone else is external (admin-registered).
        existing_dev = db.query(Developer).filter(Developer.email == user_info["email"]).first()
        if not existing_dev:
            new_developer = Developer(
                name=user.name,
                email=user.email,
                is_external=not is_internal_domain,
            )
            db.add(new_developer)
            db.commit()
    else:
        # Create new user from Google SSO. By construction we only reach this branch
        # for internal-domain emails (the not-pre-registered + non-internal case
        # was already rejected above), so the new Developer is always internal.
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
        # Flush (not commit) so user.id is available for the m2m link below,
        # then commit user + roles in a single transaction.
        db.flush()

        # Link to the system 'developer' Role so the user actually holds the
        # capabilities the role grants. Without this, the legacy users.role
        # string is set but user_roles is empty → zero effective caps.
        _link_roles_from_string(user, UserRole.DEVELOPER.value, db)
        db.commit()
        db.refresh(user)

        # Also create as Developer/Employee - ensure this always happens
        try:
            existing_dev = db.query(Developer).filter(Developer.email == user_info["email"]).first()
            if not existing_dev:
                new_developer = Developer(
                    name=user_info["name"],
                    email=user_info["email"],
                    is_external=False,
                )
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


class RoleResponse(BaseModel):
    """Role shape produced by _role_to_dict().

    Used for OpenAPI/TS typing only (no runtime serialization). user_count is
    omitted by _role_to_dict when None, so it is optional/nullable here.
    """

    id: int
    name: str
    description: str | None = None
    is_system: bool
    capability_keys: list[str]
    user_count: int | None = None
    created_at: str | None = None
    updated_at: str | None = None


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


def _link_roles_from_string(user: User, role_str: str | None, db: Session) -> None:
    """Populate user.roles from a comma-separated role-name string.

    The inverse of `_sync_legacy_role_column`. Used at User-creation time
    (Add User + SSO new-user) where the legacy `users.role` column is set
    but the many-to-many `user_roles` table — the one `has_capability`
    actually reads — would otherwise stay empty, leaving the user with zero
    effective capabilities regardless of what the role grants.

    Unknown role names are silently dropped (a missing system Role here means
    `seed_rbac` hasn't run for that role yet; the startup reconciliation
    below will catch up next boot).
    """
    if not role_str:
        return
    names = [n.strip() for n in role_str.split(",") if n.strip()]
    if not names:
        return
    roles = db.query(Role).filter(Role.name.in_(names)).all()
    existing_ids = {r.id for r in user.roles}
    for role in roles:
        if role.id not in existing_ids:
            user.roles.append(role)


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
def list_capabilities(
    response: Response,
    current_user: User = Depends(get_current_user),
):
    """Return the static capability registry. Used by the admin role-edit UI.

    The registry is process-static (defined in capabilities.py) so we mark the
    response as cacheable in the user's browser for 5 minutes to avoid
    repeated round-trips when the admin UI re-renders.
    """
    response.headers["Cache-Control"] = "private, max-age=300"
    return [{"key": k, "description": v} for k, v in CAPABILITIES.items()]


@router.get("/me/capabilities")
def get_my_capabilities(current_user: User = Depends(get_current_user)):
    """Effective capability set for the calling user (union over their roles).

    Cached in-process for 60 seconds, keyed on user id + role id set, so the
    frontend can poll this from the layout without pounding the DB. The cache
    is cleared whenever a role mutation endpoint runs.
    """
    cache_key = (current_user.id, tuple(sorted(r.id for r in current_user.roles)))
    with _caps_lock:
        hit = _caps_cache.get(cache_key)
    if hit is not None:
        return hit

    payload = {
        "roles": [r.name for r in current_user.roles],
        "capabilities": current_user.effective_capability_keys(),
    }
    with _caps_lock:
        _caps_cache[cache_key] = payload
    return payload


@router.get("/admin/roles", responses={200: {"model": list[RoleResponse]}})
def list_roles(
    db: Session = Depends(get_db), current_user: User = Depends(require_capability("admin.roles"))
):
    from models.role import user_roles as ur_table

    roles = db.query(Role).order_by(Role.is_system.desc(), Role.name.asc()).all()
    rows = (
        db.query(ur_table.c.role_id, func.count(ur_table.c.user_id))
        .group_by(ur_table.c.role_id)
        .all()
    )
    counts = dict(rows)
    return [_role_to_dict(r, user_count=counts.get(r.id, 0)) for r in roles]


@router.post(
    "/admin/roles",
    status_code=status.HTTP_201_CREATED,
    responses={201: {"model": RoleResponse}},
)
def create_role(
    req: RoleCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_capability("admin.roles_write")),
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
    _invalidate_caps_cache()
    return _role_to_dict(role, user_count=0)


@router.get("/admin/roles/{role_id}", responses={200: {"model": RoleResponse}})
def get_role(
    role_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_capability("admin.roles")),
):
    role = db.query(Role).filter(Role.id == role_id).first()
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
    return _role_to_dict(role, user_count=len(role.users))


@router.put("/admin/roles/{role_id}")
def update_role(
    role_id: int,
    req: RoleUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_capability("admin.roles_write")),
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
        _invalidate_caps_cache()

    return _role_to_dict(role, user_count=len(role.users))


@router.delete("/admin/roles/{role_id}")
def delete_role(
    role_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_capability("admin.roles_write")),
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
    _invalidate_caps_cache()

    return {"message": "Role deleted"}


@router.put("/admin/roles/{role_id}/capabilities")
def replace_role_capabilities(
    role_id: int,
    req: RoleCapabilitiesRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_capability("admin.roles_write")),
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
    _invalidate_caps_cache()
    return _role_to_dict(role, user_count=len(role.users))


@router.get("/admin/users/{user_id}/roles")
def get_user_roles(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_capability("admin.roles")),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return [_role_to_dict(r) for r in user.roles]


@router.post("/admin/users/{user_id}/roles/{role_id}", status_code=status.HTTP_201_CREATED)
def assign_role_to_user(
    user_id: int,
    role_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_capability("admin.roles_write")),
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
    _invalidate_caps_cache()
    return {"message": "Role assigned", "roles": [r.name for r in user.roles]}


@router.delete("/admin/users/{user_id}/roles/{role_id}")
def remove_role_from_user(
    user_id: int,
    role_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_capability("admin.roles_write")),
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
    _invalidate_caps_cache()
    return {"message": "Role removed", "roles": [r.name for r in user.roles]}
