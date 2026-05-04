"""
Arsenal Ops - AI-Powered Project Management Platform
FastAPI backend with Jira-like project/work item management + AI generation
"""

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
import os

# Load environment variables
from pathlib import Path
load_dotenv()
load_dotenv(Path(__file__).parent.parent / '.env')

# Import routers
from routers.projects import router as projects_router
from routers.workitems import router as workitems_router
from routers.developers import router as developers_router
from routers.prd_analysis import router as prd_router
from routers.comments import router as comments_router
from routers.admin import router as admin_router
from routers.auth import router as auth_router
from routers.personal_tasks import router as personal_tasks_router
from routers.roadmap import router as roadmap_router

# Create FastAPI app
app = FastAPI(
    title="Arsenal Ops - AI Project Management",
    description="""
    AI-powered project management platform with Jira-like boards.
    
    ## Features
    - **Projects**: Create and manage multiple projects
    - **Kanban Board**: Drag-and-drop work item management
    - **AI Generation**: Auto-generate user stories and tasks
    - **Sprint Management**: Organize work into sprints
    """,
    version="1.0.0"
)

# CORS middleware - MUST be added before other middleware/routes
# Note: allow_credentials=True CANNOT be used with allow_origins=["*"]
# So we must use specific origins list

# Start with production frontend URLs (these are always needed)
cors_origins = [
    "https://arsenal-ops.vercel.app",
    "https://www.arsenal-ops.vercel.app",
    "https://arsenal-ops-git-main-manikyashetty-archs-projects.vercel.app",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]

# Add any additional origins from environment variable
cors_origins_env = os.getenv("CORS_ORIGINS", "")
if cors_origins_env:
    for origin in cors_origins_env.split(","):
        origin = origin.strip()
        if origin and origin not in cors_origins:
            cors_origins.append(origin)

print(f"DEBUG CORS Origins: {cors_origins}")  # Debug logging

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allow_headers=["*"],
    expose_headers=["*"],
    max_age=3600,
)

# Global exception handler to ensure CORS headers on errors
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Catch all unhandled exceptions and return JSON with proper CORS headers"""
    print(f"[GLOBAL ERROR] {request.method} {request.url.path}: {str(exc)}")
    origin = request.headers.get("origin", "")
    headers = {}
    if origin in cors_origins:
        headers["Access-Control-Allow-Origin"] = origin
        headers["Access-Control-Allow-Credentials"] = "true"
        headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS, PATCH"
        headers["Access-Control-Allow-Headers"] = "*"
    return JSONResponse(
        status_code=500,
        content={"detail": f"Internal server error: {str(exc)}"},
        headers=headers,
    )

# Include routers
app.include_router(auth_router)
app.include_router(projects_router)
app.include_router(workitems_router)
app.include_router(developers_router)
app.include_router(prd_router)
app.include_router(comments_router)
app.include_router(admin_router)
app.include_router(roadmap_router)
app.include_router(personal_tasks_router)

# Startup event for database initialization
@app.on_event("startup")
async def startup_event():
    """Initialize database on startup"""
    try:
        from database import init_db, SessionLocal
        init_db()
        print("DEBUG: Database initialized successfully")
    except Exception as e:
        print(f"DEBUG: Database initialization error: {e}")

    # Run idempotent column-add migrations. Each script is a no-op if the
    # column already exists. Add new migrations here whenever a column is
    # added to an existing model so production deploys self-heal.
    try:
        import migrate_add_last_assigned_at
        migrate_add_last_assigned_at.migrate()
    except Exception as e:
        print(f"DEBUG: migrate_add_last_assigned_at failed: {e}")
    
    # Create default admin users from .env configuration
    try:
        from models.user import User, UserRole
        from models.developer import Developer
        from database import SessionLocal
        
        # Read admin emails from .env (format: "email1@company.com,email2@company.com")
        admin_emails_str = os.getenv("ADMIN_EMAILS", "manikya.shetty@arsenalai.com")
        admin_emails = [email.strip() for email in admin_emails_str.split(",") if email.strip()]
        
        db = SessionLocal()
        try:
            for email in admin_emails:
                existing = db.query(User).filter(User.email == email).first()
                if not existing:
                    # Extract name from email (part before @)
                    name = email.split("@")[0].replace(".", " ").title()
                    admin = User(
                        email=email,
                        name=name,
                        hashed_password=None,  # No password for SSO users
                        role=UserRole.ADMIN.value,
                        is_active=True,
                        is_first_login=False  # SSO users don't need password change
                    )
                    db.add(admin)
                    db.commit()
                    
                    # Also create as Developer/Employee
                    existing_dev = db.query(Developer).filter(Developer.email == email).first()
                    if not existing_dev:
                        developer = Developer(
                            name=name,
                            email=email
                        )
                        db.add(developer)
                        db.commit()
                    
                    print(f"DEFAULT ADMIN CREATED! Email: {email}, Name: {name}")
        except Exception as e:
            print(f"Admin creation error: {e}")
        finally:
            db.close()
    except Exception as e:
        print(f"Admin setup error: {e}")

@app.get("/")
@app.head("/")  # Support HEAD requests for Render health check
def root():
    """API root"""
    return {
        "name": "Arsenal Ops",
        "version": "1.0.0",
        "status": "operational",
        "endpoints": {
            "projects": "/api/projects",
            "workitems": "/api/workitems",
            "developers": "/api/developers",
            "prd_analysis": "/api/prd",
            "comments": "/api/comments",
            "admin": "/api/admin",
        },
        "docs": "/docs"
    }

@app.get("/api/health")
def health_check():
    """Health check endpoint"""
    from datetime import datetime
    azure_configured = bool(os.getenv("AZURE_OPENAI_API_KEY") and os.getenv("AZURE_OPENAI_ENDPOINT"))
    return {
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "services": {
            "ai_engine": "operational" if azure_configured else "missing_credentials",
            "api": "operational"
        },
        "version": "1.0.0"
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)