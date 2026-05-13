"""
Authentication Router - Login, logout, password management, Google SSO
"""
from fastapi import APIRouter, HTTPException, Depends, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timedelta
from jose import JWTError, jwt
from sqlalchemy.orm import Session
import secrets
import string
import hashlib
import os

import sys
sys.path.append('..')
from database import get_db
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
    return ''.join(secrets.choice(alphabet) for _ in range(length))


def verify_password(plain_password, hashed_password):
    """Verify password using SHA256 hash"""
    hashed_input = hashlib.sha256(plain_password.encode()).hexdigest()
    return hashed_input == hashed_password


def get_password_hash(password):
    """Hash password using SHA256"""
    return hashlib.sha256(password.encode()).hexdigest()


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
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
        raise credentials_exception
    
    user = db.query(User).filter(User.id == int(user_id)).first()
    if user is None:
        raise credentials_exception
    return user


def get_current_admin(current_user: User = Depends(get_current_user)):
    # Check if user has admin role (roles are comma-separated)
    if 'admin' not in current_user.role:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )
    return current_user


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
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is disabled"
        )
    
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
            "is_first_login": user.is_first_login
        }
    }


@router.post("/change-password")
def change_password(
    password_data: PasswordChange,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Change password (required on first login)"""
    # Verify current password
    if not verify_password(password_data.current_password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect"
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
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Admin: Create a new user with auto-generated password"""
    from models.developer import Developer
    
    # Check if email already exists
    existing = db.query(User).filter(User.email == user_data.email).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )
    
    # Generate temporary password
    temp_password = generate_temp_password()
    
    # Create user
    new_user = User(
        email=user_data.email,
        name=user_data.name,
        hashed_password=get_password_hash(temp_password),
        role=user_data.role,
        is_first_login=True
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    
    # If user has developer role, also create them as a Developer/Employee
    if 'developer' in user_data.role:
        # Check if developer already exists with this email
        existing_dev = db.query(Developer).filter(Developer.email == user_data.email).first()
        if not existing_dev:
            new_developer = Developer(
                name=user_data.name,
                email=user_data.email
            )
            db.add(new_developer)
            db.commit()
    
    return {
        "status": "success",
        "message": "User created successfully",
        "user": {
            "id": new_user.id,
            "email": new_user.email,
            "name": new_user.name,
            "role": new_user.role
        },
        "temporary_password": temp_password,
        "note": "Please share this password securely with the user. They will be required to change it on first login."
    }


@router.get("/admin/users", response_model=list)
def list_users(
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Admin: List all users"""
    users = db.query(User).all()
    return [user.to_dict() for user in users]


@router.post("/admin/reset-password")
def admin_reset_password(
    reset_data: PasswordReset,
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Admin: Reset a user's password"""
    user = db.query(User).filter(User.id == reset_data.user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    user.hashed_password = get_password_hash(reset_data.new_password)
    user.is_first_login = True  # Force password change
    db.commit()
    
    return {
        "status": "success",
        "message": f"Password reset for {user.email}. They must change it on next login."
    }


class RoleUpdate(BaseModel):
    role: str

@router.put("/admin/users/{user_id}/role")
def update_user_role(
    user_id: int,
    role_data: RoleUpdate,
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Admin: Update a user's role"""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    # Prevent removing the last admin
    if 'admin' in user.role and 'admin' not in role_data.role:
        # Count users with admin role (roles are comma-separated)
        all_users = db.query(User).all()
        admin_count = sum(1 for u in all_users if 'admin' in u.role)
        if admin_count <= 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot remove the last admin"
            )
    
    user.role = role_data.role
    db.commit()
    
    return {
        "status": "success",
        "message": f"User role updated to {role_data.role}",
        "user": user.to_dict()
    }


@router.delete("/admin/users/{user_id}")
@router.delete("/admin/users/{user_id}/")  # Support trailing slash
def delete_user(
    user_id: int,
    admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """Admin: Delete a user permanently"""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    # Prevent deleting yourself
    if user.id == admin.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete your own account"
        )
    
    # Prevent deleting the last admin
    if 'admin' in user.role:
        # Count users with admin role (roles are comma-separated)
        all_users = db.query(User).all()
        admin_count = sum(1 for u in all_users if 'admin' in u.role)
        if admin_count <= 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot delete the last admin"
            )
    
    # Hard delete - remove from database
    db.delete(user)
    db.commit()
    
    return {
        "status": "success",
        "message": f"User {user.email} has been permanently deleted"
    }


@router.get("/me", response_model=UserResponse)
def get_current_user_info(current_user: User = Depends(get_current_user)):
    """Get current user info"""
    return {
        "id": current_user.id,
        "email": current_user.email,
        "name": current_user.name,
        "role": current_user.role,
        "is_first_login": current_user.is_first_login
    }


@router.post("/google-login", response_model=Token)
def google_login(
    request: GoogleLoginRequest,
    db: Session = Depends(get_db)
):
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
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid Google token"
        )
    
    # Domain-based access control:
    # - Internal domains (e.g., arsenalai.com) can sign in via SSO and are auto-provisioned.
    # - Any other domain may sign in only if an admin has pre-registered the user.
    allowed_domains = [d.strip().lower() for d in os.getenv("ALLOWED_EMAIL_DOMAINS", "arsenalai.com").split(",") if d.strip()]
    email_domain = user_info['email'].split('@')[-1].lower()
    is_internal_domain = email_domain in allowed_domains

    # Check if user already exists by email
    user = db.query(User).filter(User.email == user_info['email']).first()

    if not user and not is_internal_domain:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This Google account is not authorized. Ask an admin to add your account before signing in."
        )

    if user:
        # Existing user - verify account is active
        if not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Account is disabled"
            )
        
        # Ensure existing user has a Developer record (for users created before SSO feature)
        existing_dev = db.query(Developer).filter(Developer.email == user_info['email']).first()
        if not existing_dev:
            new_developer = Developer(
                name=user.name,
                email=user.email
            )
            db.add(new_developer)
            db.commit()
    else:
        # Create new user from Google SSO
        user = User(
            email=user_info['email'],
            name=user_info['name'],
            hashed_password='',  # SSO users have no password (empty string works with or without NOT NULL)
            role=UserRole.DEVELOPER.value,
            is_active=True,
            is_first_login=False,  # SSO users don't need password change
            last_login_at=datetime.utcnow()
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        
        # Also create as Developer/Employee - ensure this always happens
        try:
            existing_dev = db.query(Developer).filter(Developer.email == user_info['email']).first()
            if not existing_dev:
                new_developer = Developer(
                    name=user_info['name'],
                    email=user_info['email']
                )
                db.add(new_developer)
                db.commit()
        except Exception as dev_error:
            db.rollback()
            print(f"Warning: Failed to create developer record for {user_info['email']}: {dev_error}")
            # Continue anyway - user account was created successfully
    
    # Update last login timestamp
    user.last_login_at = datetime.utcnow()
    db.commit()
    db.refresh(user)
    
    # Generate JWT token (same as password login)
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": str(user.id)}, 
        expires_delta=access_token_expires
    )
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "email": user.email,
            "name": user.name,
            "role": user.role,
            "is_first_login": user.is_first_login
        }
    }


@router.get("/google/config")
def get_google_config():
    """
    Get Google Client ID for frontend configuration
    Frontend needs this to initialize Google Sign-In
    """
    if not google_oauth_service.is_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Google SSO not configured"
        )
    
    return {
        "client_id": google_oauth_service.google_client_id
    }


# ============= Custom Restrictions Management =============

class CustomRestrictionRequest(BaseModel):
    name: str
    tab_name: str
    subsection: str

class CustomRestrictionResponse(BaseModel):
    id: int
    name: str
    tab_name: str
    subsection: str
    created_at: str
    
    class Config:
        from_attributes = True


@router.get("/admin/custom-restrictions")
def list_custom_restrictions(db: Session = Depends(get_db), current_user: User = Depends(get_current_admin)):
    """
    List all custom restrictions
    Admin only
    """
    from models.custom_restriction import CustomRestriction
    
    restrictions = db.query(CustomRestriction).order_by(CustomRestriction.created_at.desc()).all()
    return [
        {
            "id": r.id,
            "name": r.name,
            "tab_name": r.tab_name,
            "subsection": r.subsection,
            "created_at": r.created_at.isoformat()
        }
        for r in restrictions
    ]


@router.post("/admin/custom-restrictions")
def create_custom_restriction(
    req: CustomRestrictionRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin)
):
    """
    Create a new custom restriction
    Admin only
    """
    from models.custom_restriction import CustomRestriction
    
    # Check if restriction with this name already exists
    existing = db.query(CustomRestriction).filter(CustomRestriction.name == req.name).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Custom restriction with this name already exists"
        )
    
    restriction = CustomRestriction(
        name=req.name,
        tab_name=req.tab_name,
        subsection=req.subsection
    )
    db.add(restriction)
    db.commit()
    db.refresh(restriction)
    
    return {
        "id": restriction.id,
        "name": restriction.name,
        "tab_name": restriction.tab_name,
        "subsection": restriction.subsection,
        "created_at": restriction.created_at.isoformat()
    }


@router.put("/admin/custom-restrictions/{restriction_id}")
def update_custom_restriction(
    restriction_id: int,
    req: CustomRestrictionRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin)
):
    """
    Update a custom restriction
    Admin only
    """
    from models.custom_restriction import CustomRestriction
    
    restriction = db.query(CustomRestriction).filter(CustomRestriction.id == restriction_id).first()
    if not restriction:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Custom restriction not found"
        )
    
    # Check if new name conflicts with another restriction
    if req.name != restriction.name:
        existing = db.query(CustomRestriction).filter(CustomRestriction.name == req.name).first()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Custom restriction with this name already exists"
            )
    
    restriction.name = req.name
    restriction.tab_name = req.tab_name
    restriction.subsection = req.subsection
    db.commit()
    db.refresh(restriction)
    
    return {
        "id": restriction.id,
        "name": restriction.name,
        "tab_name": restriction.tab_name,
        "subsection": restriction.subsection,
        "created_at": restriction.created_at.isoformat()
    }


@router.delete("/admin/custom-restrictions/{restriction_id}")
def delete_custom_restriction(
    restriction_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin)
):
    """
    Delete a custom restriction
    Admin only
    """
    from models.custom_restriction import CustomRestriction
    
    restriction = db.query(CustomRestriction).filter(CustomRestriction.id == restriction_id).first()
    if not restriction:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Custom restriction not found"
        )
    
    db.delete(restriction)
    db.commit()
    
    return {"message": "Custom restriction deleted successfully"}


@router.post("/admin/users/{user_id}/custom-restrictions/{restriction_id}")
def assign_restriction_to_user(
    user_id: int,
    restriction_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin)
):
    """
    Assign a custom restriction to a user
    Admin only
    """
    from models.custom_restriction import CustomRestriction
    
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    restriction = db.query(CustomRestriction).filter(CustomRestriction.id == restriction_id).first()
    if not restriction:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Custom restriction not found"
        )
    
    # Check if already assigned
    if restriction in user.custom_restrictions:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Restriction already assigned to user"
        )
    
    user.custom_restrictions.append(restriction)
    db.commit()
    
    return {"message": "Restriction assigned to user successfully"}


@router.delete("/admin/users/{user_id}/custom-restrictions/{restriction_id}")
def remove_restriction_from_user(
    user_id: int,
    restriction_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin)
):
    """
    Remove a custom restriction from a user
    Admin only
    """
    from models.custom_restriction import CustomRestriction
    
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    restriction = db.query(CustomRestriction).filter(CustomRestriction.id == restriction_id).first()
    if not restriction:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Custom restriction not found"
        )
    
    # Check if assigned
    if restriction not in user.custom_restrictions:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Restriction not assigned to user"
        )
    
    user.custom_restrictions.remove(restriction)
    db.commit()
    
    return {"message": "Restriction removed from user successfully"}


@router.get("/admin/users/{user_id}/custom-restrictions")
def get_user_custom_restrictions(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin)
):
    """
    Get all custom restrictions for a user
    Admin only
    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    return [
        {
            "id": r.id,
            "name": r.name,
            "tab_name": r.tab_name,
            "subsection": r.subsection,
            "created_at": r.created_at.isoformat()
        }
        for r in user.custom_restrictions
    ]


@router.get("/me/custom-restrictions")
def get_my_custom_restrictions(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """
    Get current user's custom restrictions
    Accessible to all authenticated users
    """
    return [
        {
            "id": r.id,
            "name": r.name,
            "tab_name": r.tab_name,
            "subsection": r.subsection,
            "created_at": r.created_at.isoformat()
        }
        for r in current_user.custom_restrictions
    ]
