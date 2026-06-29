"""
Arsenal Ops - AI-Powered Project Management Platform
FastAPI backend with Jira-like project/work item management + AI generation
"""

import logging
import os

# Load environment variables
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse, ORJSONResponse

load_dotenv()
load_dotenv(Path(__file__).parent.parent / ".env")

logger = logging.getLogger(__name__)

# Imports below run after load_dotenv so module-level env reads (router-level
# config; the MCP server's JWTVerifier reading the required SECRET_KEY) see the
# right values. mcp_app is mounted at /mcp further down.
from mcp_server import mcp_app, oauth_well_known_routes  # noqa: E402
from routers.admin import router as admin_router  # noqa: E402
from routers.auth import router as auth_router  # noqa: E402
from routers.comments import router as comments_router  # noqa: E402
from routers.developers import router as developers_router  # noqa: E402
from routers.overview import router as overview_router  # noqa: E402
from routers.personal_tasks import router as personal_tasks_router  # noqa: E402
from routers.prd_analysis import router as prd_router  # noqa: E402
from routers.project_categories import router as project_categories_router  # noqa: E402
from routers.projects import router as projects_router  # noqa: E402
from routers.pulse import router as pulse_router  # noqa: E402
from routers.roadmap import router as roadmap_router  # noqa: E402
from routers.workitems import router as workitems_router  # noqa: E402


@asynccontextmanager
async def lifespan(app: FastAPI):
    """App lifespan: run the existing DB/bootstrap startup, then enter the MCP
    server's own lifespan so its (stateless) session manager is initialized.

    Composing `mcp_app.lifespan` here is the one non-obvious mounting step —
    without it the mounted /mcp app raises on the first request. `_run_startup`
    holds the former `@app.on_event("startup")` body (defined below).
    """
    await _run_startup()
    async with mcp_app.lifespan(app):
        yield


# Create FastAPI app
app = FastAPI(
    lifespan=lifespan,
    title="Arsenal Ops - AI Project Management",
    description="""
    AI-powered project management platform with Jira-like boards.

    ## Features
    - **Projects**: Create and manage multiple projects
    - **Kanban Board**: Drag-and-drop work item management
    - **AI Generation**: Auto-generate user stories and tasks
    - **Sprint Management**: Organize work into sprints
    """,
    version="1.0.0",
    default_response_class=ORJSONResponse,
)

# CORS middleware - MUST be added before other middleware/routes
# Note: allow_credentials=True CANNOT be used with allow_origins=["*"]
# So we must use specific origins list

# Start with production frontend URLs (these are always needed)
cors_origins = [
    "https://arsenal-ops.vercel.app",
    "https://www.arsenal-ops.vercel.app",
    "https://arsenal-ops-git-main-manikyashetty-archs-projects.vercel.app",
    # Vite's default port plus its auto-fallback ports when 5173 is in use
    # (common when running multiple frontend projects locally).
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5174",
    "http://localhost:5175",
    "http://127.0.0.1:5175",
]

# Add any additional origins from environment variable
cors_origins_env = os.getenv("CORS_ORIGINS", "")
if cors_origins_env:
    for origin in cors_origins_env.split(","):
        origin = origin.strip()
        if origin and origin not in cors_origins:
            cors_origins.append(origin)

logger.debug("CORS Origins: %s", cors_origins)

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allow_headers=["*"],
    expose_headers=["X-Total-Count", "ETag", "Cache-Control", "Content-Disposition"],
    max_age=3600,
)

# ETag middleware MUST be added before GZip so it sees the uncompressed
# response body on the way out (Starlette's `insert(0, ...)` semantics put the
# last-added middleware outermost, so adding ETag here — before GZip —
# leaves ETag innermore than GZip on the response path). Gated behind
# ENABLE_ETAG_MIDDLEWARE so it ships disabled and we can flip it on per env.
if os.getenv("ENABLE_ETAG_MIDDLEWARE", "false").lower() == "true":
    from middleware.etag import ETagMiddleware

    app.add_middleware(ETagMiddleware)
    logger.info("[middleware] ETagMiddleware enabled")

# GZip large responses (added after CORS so it runs before CORS on requests
# and after CORS on responses — i.e. the body is gzipped, then CORS adds headers).
app.add_middleware(GZipMiddleware, minimum_size=1000)

# Request timing + query count instrumentation. No-op unless PERF_LOG=1.
from middleware.perf import PerfMiddleware  # noqa: E402

app.add_middleware(PerfMiddleware)


# Global exception handler to ensure CORS headers on errors
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Catch all unhandled exceptions and return JSON with proper CORS headers"""
    logger.exception("[GLOBAL ERROR] %s %s", request.method, request.url.path)
    origin = request.headers.get("origin", "")
    headers = {}
    if origin in cors_origins:
        headers["Access-Control-Allow-Origin"] = origin
        headers["Access-Control-Allow-Credentials"] = "true"
        headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS, PATCH"
        headers["Access-Control-Allow-Headers"] = "*"
    return JSONResponse(
        status_code=500,
        content={"detail": f"Internal server error: {exc!s}"},
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
app.include_router(overview_router)
app.include_router(pulse_router)
app.include_router(project_categories_router)

# Mount the MCP server as a sub-app. With http_app(path="/"), the streamable
# HTTP endpoint is /mcp/ (clients connect to /mcp). Auth + RBAC are enforced
# inside the MCP layer (JWTVerifier + per-tool capability checks), independent
# of the REST routes above. Its lifespan is composed in `lifespan` above.
app.mount("/mcp", mcp_app)

# Expose the OAuth discovery (well-known) metadata at the ROOT, where the 401
# challenge advertises it (RFC 9728). The mounted sub-app serves these under
# /mcp, so without this the OAuth discovery first hop 404s. No-op when OAuth is
# disabled. See mcp_server.oauth_well_known_routes.
for _wk_route in oauth_well_known_routes("/"):
    app.router.routes.append(_wk_route)


# Database/bootstrap initialization, invoked from the `lifespan` handler above.
async def _run_startup():
    """Initialize database on startup"""
    try:
        from database import SessionLocal, engine, init_db

        init_db()
        logger.info("[DB] Using %s", engine.url.get_backend_name())
        logger.info("Database initialized successfully")
    except Exception as e:
        logger.exception("Database initialization error: %s", e)

    # Run idempotent column-add migrations. Each script is a no-op if the
    # column already exists. Add new migrations here whenever a column is
    # added to an existing model so production deploys self-heal.
    try:
        import migrate_add_last_assigned_at

        migrate_add_last_assigned_at.migrate()
    except Exception as e:
        logger.exception("migrate_add_last_assigned_at failed: %s", e)

    try:
        import migrate_add_perf_indexes

        migrate_add_perf_indexes.migrate()
    except Exception as e:
        logger.exception("migrate_add_perf_indexes failed: %s", e)

    # Seed every email in ADMIN_EMAILS as an admin on startup. Idempotent:
    # users that already carry the admin role are left untouched; existing
    # non-admin users have "admin" appended to their comma-separated role list
    # so their other roles are preserved. Also links them to the RBAC 'admin'
    # Role row so they get the wildcard capability grant (without this, the
    # legacy column says "admin" but user.roles is empty → can(...) returns
    # false → every require_capability-gated endpoint 403s for them).
    try:
        from database import SessionLocal
        from models.developer import Developer
        from models.role import Role
        from models.user import User, UserRole, has_role

        admin_emails_str = os.getenv("ADMIN_EMAILS", "manikya.shetty@arsenalai.com")
        admin_emails = [e.strip() for e in admin_emails_str.split(",") if e.strip()]

        if admin_emails:
            db = SessionLocal()
            try:
                # seed_rbac() runs inside init_db() above, so the 'admin' Role row
                # should exist by now. If it doesn't (e.g. seed failed silently),
                # log and skip the role-linking step rather than crashing startup.
                admin_role = db.query(Role).filter(Role.name == "admin").first()
                if not admin_role:
                    logger.error(
                        "[BOOTSTRAP] 'admin' Role row missing — RBAC seed may have failed. "
                        "ADMIN_EMAILS users will get the legacy role column but no capabilities."
                    )

                created = 0
                promoted = 0
                rbac_linked = 0
                for email in admin_emails:
                    existing = db.query(User).filter(User.email == email).first()
                    if existing:
                        legacy_already_admin = has_role(existing.role or "", UserRole.ADMIN.value)
                        rbac_already_admin = admin_role is not None and admin_role in existing.roles

                        if legacy_already_admin and rbac_already_admin:
                            continue

                        if not legacy_already_admin:
                            existing.role = (
                                f"{existing.role},{UserRole.ADMIN.value}"
                                if existing.role
                                else UserRole.ADMIN.value
                            )
                            existing.is_active = True
                            promoted += 1
                            logger.warning(
                                "[BOOTSTRAP] Promoted %s to admin (legacy column)", email
                            )

                        if admin_role is not None and not rbac_already_admin:
                            existing.roles.append(admin_role)
                            rbac_linked += 1
                            logger.warning("[BOOTSTRAP] Linked %s to RBAC admin role", email)

                        db.commit()
                        continue

                    name = email.split("@")[0].replace(".", " ").title()
                    admin = User(
                        email=email,
                        name=name,
                        hashed_password=None,
                        role=UserRole.ADMIN.value,
                        is_active=True,
                        is_first_login=False,
                    )
                    if admin_role is not None:
                        admin.roles.append(admin_role)
                        rbac_linked += 1
                    db.add(admin)
                    db.commit()
                    created += 1
                    logger.warning("[BOOTSTRAP] Seeded admin %s", email)

                    if not db.query(Developer).filter(Developer.email == email).first():
                        db.add(Developer(name=name, email=email))
                        db.commit()

                if created or promoted or rbac_linked:
                    logger.warning(
                        "[BOOTSTRAP] Admin seeding done: %d created, %d promoted, %d RBAC-linked",
                        created,
                        promoted,
                        rbac_linked,
                    )
            except Exception as e:
                db.rollback()
                logger.exception("Admin bootstrap error: %s", e)
            finally:
                db.close()
    except Exception as e:
        logger.exception("Admin bootstrap setup error: %s", e)


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
        "docs": "/docs",
    }


@app.get("/api/health")
def health_check():
    """Health check endpoint"""
    from datetime import datetime

    openai_configured = bool(os.getenv("OPENAI_API_KEY"))
    return {
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "services": {
            "ai_engine": "operational" if openai_configured else "missing_credentials",
            "api": "operational",
        },
        "version": "1.0.0",
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
