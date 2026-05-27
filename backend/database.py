"""
Database configuration and session management
"""

import os

from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

# Use PostgreSQL if DATABASE_URL is set, otherwise fallback to SQLite
DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    # Fallback to SQLite for local development
    DATABASE_URL = "sqlite:///./productmind.db"

# Configure connection pooling for Neon
connect_args = {"check_same_thread": False} if "sqlite" in DATABASE_URL else {}

engine = create_engine(
    DATABASE_URL,
    connect_args=connect_args,
    pool_pre_ping=True,  # Verify connections before using
    pool_recycle=300,  # Recycle every 5 minutes
    pool_size=5,  # Max 5 connections
    max_overflow=10,  # Allow 10 extra if needed
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# Attach the perf query counter when PERF_LOG=1 (no-op otherwise).
from middleware.perf import register_query_counter  # noqa: E402

register_query_counter(engine)


def get_db():
    """Dependency for getting database sessions"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def run_migrations():
    """Run database migrations for schema updates"""
    from sqlalchemy import text

    with engine.connect() as conn:
        # Migration: Add logged_hours column to work_items
        try:
            result = conn.execute(
                text("""
                SELECT column_name
                FROM information_schema.columns
                WHERE table_name = 'work_items' AND column_name = 'logged_hours'
            """)
            )

            if not result.fetchone():
                print("[MIGRATION] Adding logged_hours column to work_items...")
                conn.execute(
                    text("""
                    ALTER TABLE work_items
                    ADD COLUMN logged_hours INTEGER DEFAULT 0
                """)
                )
                conn.commit()
                print("[MIGRATION] logged_hours column added successfully!")
        except Exception as e:
            print(f"[MIGRATION ERROR] {e}")

        # Migration: Add goal_id column to work_items
        try:
            result = conn.execute(
                text("""
                SELECT column_name
                FROM information_schema.columns
                WHERE table_name = 'work_items' AND column_name = 'goal_id'
            """)
            )

            if not result.fetchone():
                print("[MIGRATION] Adding goal_id column to work_items...")
                conn.execute(
                    text("""
                    ALTER TABLE work_items
                    ADD COLUMN goal_id INTEGER REFERENCES project_goals(id) ON DELETE SET NULL
                """)
                )
                conn.commit()
                print("[MIGRATION] goal_id column added successfully!")
        except Exception as e:
            print(f"[MIGRATION ERROR] {e}")

        # Migration: Add start_date column to work_items
        try:
            result = conn.execute(
                text("""
                SELECT column_name
                FROM information_schema.columns
                WHERE table_name = 'work_items' AND column_name = 'start_date'
            """)
            )

            if not result.fetchone():
                print("[MIGRATION] Adding start_date column to work_items...")
                conn.execute(
                    text("""
                    ALTER TABLE work_items
                    ADD COLUMN start_date TIMESTAMP
                """)
                )
                conn.commit()
                print("[MIGRATION] start_date column added successfully!")
        except Exception as e:
            print(f"[MIGRATION ERROR] {e}")

        # Migration: Create task_dependencies table if not exists
        try:
            result = conn.execute(
                text("""
                SELECT table_name
                FROM information_schema.tables
                WHERE table_name = 'task_dependencies'
            """)
            )

            if not result.fetchone():
                print("[MIGRATION] Creating task_dependencies table...")
                conn.execute(
                    text("""
                    CREATE TABLE task_dependencies (
                        id SERIAL PRIMARY KEY,
                        work_item_id INTEGER REFERENCES work_items(id) ON DELETE CASCADE,
                        depends_on_id INTEGER REFERENCES work_items(id) ON DELETE CASCADE,
                        dependency_type VARCHAR(20) DEFAULT 'blocks',
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )
                """)
                )
                conn.commit()
                print("[MIGRATION] task_dependencies table created!")
        except Exception as e:
            print(f"[MIGRATION ERROR] {e}")

        # Migration: Create project_goals table if not exists
        try:
            result = conn.execute(
                text("""
                SELECT table_name
                FROM information_schema.tables
                WHERE table_name = 'project_goals'
            """)
            )

            if not result.fetchone():
                print("[MIGRATION] Creating project_goals table...")
                conn.execute(
                    text("""
                    CREATE TABLE project_goals (
                        id SERIAL PRIMARY KEY,
                        project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
                        title VARCHAR(255) NOT NULL,
                        description TEXT,
                        status VARCHAR(20) DEFAULT 'active',
                        progress INTEGER DEFAULT 0,
                        due_date TIMESTAMP,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )
                """)
                )
                conn.commit()
                print("[MIGRATION] project_goals table created!")
        except Exception as e:
            print(f"[MIGRATION ERROR] {e}")

        # Migration: Add is_admin column to project_developers
        try:
            result = conn.execute(
                text("""
                SELECT column_name
                FROM information_schema.columns
                WHERE table_name = 'project_developers' AND column_name = 'is_admin'
            """)
            )

            if not result.fetchone():
                print("[MIGRATION] Adding is_admin column to project_developers...")
                conn.execute(
                    text("""
                    ALTER TABLE project_developers
                    ADD COLUMN is_admin BOOLEAN DEFAULT FALSE
                """)
                )
                conn.commit()
                print("[MIGRATION] is_admin column added successfully!")
        except Exception as e:
            print(f"[MIGRATION ERROR] {e}")

        # Migration: Create project_milestones table if not exists
        try:
            result = conn.execute(
                text("""
                SELECT table_name
                FROM information_schema.tables
                WHERE table_name = 'project_milestones'
            """)
            )

            if not result.fetchone():
                print("[MIGRATION] Creating project_milestones table...")
                conn.execute(
                    text("""
                    CREATE TABLE project_milestones (
                        id SERIAL PRIMARY KEY,
                        project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
                        title VARCHAR(255) NOT NULL,
                        description VARCHAR(500),
                        due_date TIMESTAMP,
                        completed_at TIMESTAMP,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )
                """)
                )
                conn.commit()
                print("[MIGRATION] project_milestones table created!")
        except Exception as e:
            print(f"[MIGRATION ERROR] {e}")

        # Migration: Create activity_logs table if not exists
        try:
            result = conn.execute(
                text("""
                SELECT table_name
                FROM information_schema.tables
                WHERE table_name = 'activity_logs'
            """)
            )

            if not result.fetchone():
                print("[MIGRATION] Creating activity_logs table...")
                conn.execute(
                    text("""
                    CREATE TABLE activity_logs (
                        id SERIAL PRIMARY KEY,
                        project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
                        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                        action VARCHAR(50) NOT NULL,
                        entity_type VARCHAR(50),
                        entity_id INTEGER,
                        title VARCHAR(255),
                        description TEXT,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )
                """)
                )
                conn.commit()
                print("[MIGRATION] activity_logs table created!")
        except Exception as e:
            print(f"[MIGRATION ERROR] {e}")

        # Migration: Create time_entries table if not exists
        try:
            result = conn.execute(
                text("""
                SELECT table_name
                FROM information_schema.tables
                WHERE table_name = 'time_entries'
            """)
            )

            if not result.fetchone():
                print("[MIGRATION] Creating time_entries table...")
                conn.execute(
                    text("""
                    CREATE TABLE time_entries (
                        id SERIAL PRIMARY KEY,
                        work_item_id INTEGER REFERENCES work_items(id) ON DELETE CASCADE NOT NULL,
                        developer_id INTEGER REFERENCES developers(id) ON DELETE SET NULL,
                        hours INTEGER NOT NULL,
                        description TEXT,
                        logged_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )
                """)
                )
                conn.execute(
                    text("CREATE INDEX idx_time_entry_work_item ON time_entries(work_item_id)")
                )
                conn.execute(
                    text("CREATE INDEX idx_time_entry_developer ON time_entries(developer_id)")
                )
                conn.commit()
                print("[MIGRATION] time_entries table created!")
        except Exception as e:
            print(f"[MIGRATION ERROR] {e}")

        # Migration: Add key_prefix column to projects
        try:
            result = conn.execute(
                text("""
                SELECT column_name
                FROM information_schema.columns
                WHERE table_name = 'projects' AND column_name = 'key_prefix'
            """)
            )

            if not result.fetchone():
                print("[MIGRATION] Adding key_prefix column to projects...")
                conn.execute(
                    text("""
                    ALTER TABLE projects
                    ADD COLUMN key_prefix VARCHAR(10) DEFAULT 'PROJ'
                """)
                )
                conn.commit()
                print("[MIGRATION] key_prefix column added successfully!")
        except Exception as e:
            print(f"[MIGRATION ERROR] {e}")

        # Migration: Add is_resolved column to comments
        try:
            result = conn.execute(
                text("""
                SELECT column_name
                FROM information_schema.columns
                WHERE table_name = 'comments' AND column_name = 'is_resolved'
            """)
            )

            if not result.fetchone():
                print("[MIGRATION] Adding is_resolved column to comments...")
                conn.execute(
                    text("""
                    ALTER TABLE comments
                    ADD COLUMN is_resolved BOOLEAN DEFAULT FALSE
                """)
                )
                conn.commit()
                print("[MIGRATION] is_resolved column added successfully!")
        except Exception as e:
            print(f"[MIGRATION ERROR] {e}")

        # Migration: Create project_files table if not exists
        try:
            result = conn.execute(
                text("""
                SELECT table_name
                FROM information_schema.tables
                WHERE table_name = 'project_files'
            """)
            )

            if not result.fetchone():
                print("[MIGRATION] Creating project_files table...")
                conn.execute(
                    text("""
                    CREATE TABLE project_files (
                        id SERIAL PRIMARY KEY,
                        project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
                        file_name VARCHAR(255) NOT NULL,
                        file_size INTEGER NOT NULL,
                        file_type VARCHAR(100) NOT NULL,
                        file_url VARCHAR(500) NOT NULL,
                        uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
                        uploaded_by_name VARCHAR(255) NOT NULL,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        CONSTRAINT fk_project_files_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
                    )
                """)
                )
                conn.execute(
                    text("CREATE INDEX idx_project_files_project ON project_files(project_id)")
                )
                conn.execute(
                    text("CREATE INDEX idx_project_files_created ON project_files(created_at)")
                )
                conn.commit()
                print("[MIGRATION] project_files table created!")
        except Exception as e:
            print(f"[MIGRATION ERROR] {e}")

        # Migration: Create personal_tasks table if not exists
        try:
            result = conn.execute(
                text("""
                SELECT table_name
                FROM information_schema.tables
                WHERE table_name = 'personal_tasks'
            """)
            )

            if not result.fetchone():
                print("[MIGRATION] Creating personal_tasks table...")
                conn.execute(
                    text("""
                    CREATE TABLE personal_tasks (
                        id SERIAL PRIMARY KEY,
                        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE NOT NULL,
                        title VARCHAR(255) NOT NULL,
                        description TEXT,
                        status VARCHAR(50) DEFAULT 'todo',
                        priority VARCHAR(50) DEFAULT 'medium',
                        project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
                        work_item_id INTEGER REFERENCES work_items(id) ON DELETE SET NULL,
                        estimated_hours INTEGER DEFAULT 0,
                        due_date TIMESTAMP,
                        tags JSON DEFAULT '[]',
                        is_converted BOOLEAN DEFAULT FALSE,
                        converted_at TIMESTAMP,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )
                """)
                )
                conn.execute(
                    text("CREATE INDEX idx_personal_tasks_user ON personal_tasks(user_id)")
                )
                conn.execute(
                    text("CREATE INDEX idx_personal_tasks_status ON personal_tasks(status)")
                )
                conn.execute(
                    text("CREATE INDEX idx_personal_tasks_project ON personal_tasks(project_id)")
                )
                conn.commit()
                print("[MIGRATION] personal_tasks table created!")
        except Exception as e:
            print(f"[MIGRATION ERROR] {e}")

        # Migration: Create project_links table if not exists
        try:
            result = conn.execute(
                text("""
                SELECT table_name
                FROM information_schema.tables
                WHERE table_name = 'project_links'
            """)
            )

            if not result.fetchone():
                print("[MIGRATION] Creating project_links table...")
                conn.execute(
                    text("""
                    CREATE TABLE project_links (
                        id SERIAL PRIMARY KEY,
                        project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
                        name VARCHAR(255) NOT NULL,
                        url VARCHAR(500) NOT NULL,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        CONSTRAINT fk_project_links_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
                    )
                """)
                )
                conn.execute(
                    text("CREATE INDEX idx_project_links_project ON project_links(project_id)")
                )
                conn.execute(
                    text("CREATE INDEX idx_project_links_created ON project_links(created_at)")
                )
                conn.commit()
                print("[MIGRATION] project_links table created!")
        except Exception as e:
            print(f"[MIGRATION ERROR] {e}")

        # Migration: Increase role column size in users table
        try:
            result = conn.execute(
                text("""
                SELECT column_name, character_maximum_length
                FROM information_schema.columns
                WHERE table_name = 'users' AND column_name = 'role'
            """)
            )

            row = result.fetchone()
            if row and row[1] and row[1] < 255:
                print("[MIGRATION] Increasing role column size in users table...")
                conn.execute(
                    text("""
                    ALTER TABLE users
                    ALTER COLUMN role TYPE VARCHAR(255)
                """)
                )
                conn.commit()
                print("[MIGRATION] role column size increased successfully!")
        except Exception as e:
            print(f"[MIGRATION ERROR] {e}")

        # Migration: Add end_date column to projects
        try:
            result = conn.execute(
                text("""
                SELECT column_name
                FROM information_schema.columns
                WHERE table_name = 'projects' AND column_name = 'end_date'
            """)
            )

            if not result.fetchone():
                print("[MIGRATION] Adding end_date column to projects...")
                conn.execute(
                    text("""
                    ALTER TABLE projects
                    ADD COLUMN end_date TIMESTAMP NULL
                """)
                )
                conn.commit()
                print("[MIGRATION] end_date column added successfully!")
        except Exception as e:
            print(f"[MIGRATION ERROR] {e}")

        # Migration: Add github_repo_urls column to projects
        try:
            result = conn.execute(
                text("""
                SELECT column_name
                FROM information_schema.columns
                WHERE table_name = 'projects' AND column_name = 'github_repo_urls'
            """)
            )

            if not result.fetchone():
                print("[MIGRATION] Adding github_repo_urls column to projects...")
                conn.execute(
                    text("""
                    ALTER TABLE projects
                    ADD COLUMN github_repo_urls JSON DEFAULT '[]'
                """)
                )
                conn.commit()
                print("[MIGRATION] github_repo_urls column added successfully!")

                # Migrate existing github_repo_url values to github_repo_urls
                print(
                    "[MIGRATION] Migrating existing github_repo_url values to github_repo_urls..."
                )
                try:
                    conn.execute(
                        text("""
                        UPDATE projects
                        SET github_repo_urls = jsonb_build_array(github_repo_url)
                        WHERE github_repo_url IS NOT NULL
                        AND (github_repo_urls IS NULL OR github_repo_urls = '[]'::jsonb)
                    """)
                    )
                    conn.commit()
                    print("[MIGRATION] Migration of github_repo_url to github_repo_urls completed!")
                except Exception as migrate_err:
                    print(
                        f"[MIGRATION WARNING] Could not auto-migrate existing URLs: {migrate_err}"
                    )
                    conn.rollback()
        except Exception as e:
            print(f"[MIGRATION ERROR] {e}")

        # Migration: Create work_item_assignment_history + backfill from current state
        try:
            result = conn.execute(
                text("""
                SELECT table_name
                FROM information_schema.tables
                WHERE table_name = 'work_item_assignment_history'
            """)
            )

            if not result.fetchone():
                print("[MIGRATION] Creating work_item_assignment_history table...")
                conn.execute(
                    text("""
                    CREATE TABLE work_item_assignment_history (
                        id SERIAL PRIMARY KEY,
                        work_item_id INTEGER NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
                        developer_id INTEGER REFERENCES developers(id) ON DELETE SET NULL,
                        assigned_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                        unassigned_at TIMESTAMP NULL
                    )
                """)
                )
                conn.execute(
                    text(
                        "CREATE INDEX idx_wiah_work_item_assigned ON work_item_assignment_history(work_item_id, assigned_at)"
                    )
                )
                conn.execute(
                    text(
                        "CREATE INDEX idx_wiah_developer_assigned ON work_item_assignment_history(developer_id, assigned_at)"
                    )
                )
                conn.commit()
                print("[MIGRATION] work_item_assignment_history table created!")

                # One-time backfill: open a current span for every assigned work item.
                print("[MIGRATION] Backfilling assignment history from current work_items state...")
                conn.execute(
                    text("""
                    INSERT INTO work_item_assignment_history (work_item_id, developer_id, assigned_at, unassigned_at)
                    SELECT id, assignee_id, COALESCE(last_assigned_at, created_at), NULL
                    FROM work_items
                    WHERE assignee_id IS NOT NULL
                """)
                )
                conn.commit()
                print("[MIGRATION] Backfill complete.")
        except Exception as e:
            print(f"[MIGRATION ERROR] work_item_assignment_history: {e}")

        # Migration: Make hashed_password nullable for SSO users
        try:
            result = conn.execute(
                text("""
                SELECT is_nullable
                FROM information_schema.columns
                WHERE table_name = 'users' AND column_name = 'hashed_password'
            """)
            )
            row = result.fetchone()
            if row and row[0] == "NO":
                print("[MIGRATION] Making hashed_password nullable for SSO users...")
                conn.execute(
                    text("""
                    ALTER TABLE users ALTER COLUMN hashed_password DROP NOT NULL
                """)
                )
                conn.commit()
                print("[MIGRATION] hashed_password is now nullable!")
        except Exception as e:
            print(f"[MIGRATION ERROR] hashed_password nullable: {e}")

        # Migration: Add is_external flag to developers (separates external users
        # created via Admin → Users → Add User from internal team members).
        try:
            result = conn.execute(
                text("""
                SELECT column_name
                FROM information_schema.columns
                WHERE table_name = 'developers' AND column_name = 'is_external'
            """)
            )
            if not result.fetchone():
                print("[MIGRATION] Adding is_external column to developers...")
                conn.execute(
                    text("""
                    ALTER TABLE developers
                    ADD COLUMN is_external BOOLEAN NOT NULL DEFAULT FALSE
                """)
                )
                conn.commit()
                print(
                    "[MIGRATION] is_external column added (defaulting all existing rows to FALSE)"
                )
        except Exception as e:
            print(f"[MIGRATION ERROR] developers.is_external: {e}")


SYSTEM_ROLES: list[tuple[str, str, list[str]]] = [
    ("admin", "Full system access", ["*"]),
    ("project_manager", "Project manager access to all project tabs", ["project.*"]),
    # Developer grants match the pre-RBAC blocklist behaviour: everything in a
    # project except the PM tab + its subsections and the pulse admin settings.
    (
        "developer",
        "Default developer access",
        [
            "project.overview.*",
            "project.tracker.*",
            "project.calendar",
            "project.pulse",
            "project.business",
            "project.activity",
        ],
    ),
]


def seed_rbac():
    """Idempotent seed of system roles and backfill of user_roles from legacy users.role."""
    from sqlalchemy import text

    with engine.connect() as conn:
        # Skip silently if the RBAC tables aren't there yet (e.g. SQLite without create_all)
        try:
            probe = conn.execute(
                text("""
                SELECT table_name FROM information_schema.tables WHERE table_name = 'roles'
            """)
            )
            if not probe.fetchone():
                return
        except Exception:
            # information_schema isn't available (SQLite) — let create_all build the tables and
            # come back next startup, or rely on a Postgres-only deployment.
            return

        # Seed system roles
        for name, desc, caps in SYSTEM_ROLES:
            try:
                existing = conn.execute(
                    text("SELECT id FROM roles WHERE name = :n"),
                    {"n": name},
                ).fetchone()
                if existing:
                    continue
                role_id = conn.execute(
                    text("""
                        INSERT INTO roles (name, description, is_system, created_at, updated_at)
                        VALUES (:n, :d, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                        RETURNING id
                    """),
                    {"n": name, "d": desc},
                ).scalar()
                for cap in caps:
                    conn.execute(
                        text("""
                            INSERT INTO role_capabilities (role_id, capability_key)
                            VALUES (:rid, :cap)
                        """),
                        {"rid": role_id, "cap": cap},
                    )
                conn.commit()
                print(f"[SEED] Seeded system role '{name}' with {len(caps)} capability grant(s)")
            except Exception as e:
                print(f"[SEED ERROR] role '{name}': {e}")
                conn.rollback()

        # One-shot upgrade: widen 'developer' grants from the initial too-narrow seed
        # to the post-RBAC-swap defaults. Only runs when grants exactly match the old
        # seed (i.e. an admin hasn't customised them).
        try:
            OLD_DEV_GRANTS = {
                "project.overview.prd",
                "project.overview.architecture",
                "project.overview.team",
                "project.overview.resources",
                "project.tracker.sprints",
                "project.calendar",
                "project.activity",
            }
            NEW_DEV_GRANTS = [g for n, _, gs in SYSTEM_ROLES if n == "developer" for g in gs]
            dev_row = conn.execute(
                text("SELECT id FROM roles WHERE name = 'developer' AND is_system = TRUE")
            ).fetchone()
            if dev_row:
                dev_id = dev_row[0]
                current = {
                    r[0]
                    for r in conn.execute(
                        text("SELECT capability_key FROM role_capabilities WHERE role_id = :rid"),
                        {"rid": dev_id},
                    ).fetchall()
                }
                if current == OLD_DEV_GRANTS:
                    conn.execute(
                        text("DELETE FROM role_capabilities WHERE role_id = :rid"),
                        {"rid": dev_id},
                    )
                    for g in NEW_DEV_GRANTS:
                        conn.execute(
                            text(
                                "INSERT INTO role_capabilities (role_id, capability_key) VALUES (:rid, :g)"
                            ),
                            {"rid": dev_id, "g": g},
                        )
                    conn.commit()
                    print(
                        "[SEED] Upgraded 'developer' role grants to match pre-RBAC blocklist behaviour"
                    )
        except Exception as e:
            print(f"[SEED ERROR] developer grants upgrade: {e}")
            conn.rollback()

        # Backfill user_roles from existing users.role comma-string — only when empty
        try:
            count = conn.execute(text("SELECT COUNT(*) FROM user_roles")).scalar()
            if count and count > 0:
                return
            users = conn.execute(
                text("SELECT id, role FROM users WHERE role IS NOT NULL")
            ).fetchall()
            roles = conn.execute(text("SELECT id, name FROM roles")).fetchall()
            role_map = {row[1]: row[0] for row in roles}

            inserted = 0
            for uid, role_str in users:
                for r_name in [s.strip() for s in (role_str or "").split(",") if s.strip()]:
                    rid = role_map.get(r_name)
                    if not rid:
                        continue
                    conn.execute(
                        text("""
                            INSERT INTO user_roles (user_id, role_id, assigned_at)
                            VALUES (:uid, :rid, CURRENT_TIMESTAMP)
                            ON CONFLICT DO NOTHING
                        """),
                        {"uid": uid, "rid": rid},
                    )
                    inserted += 1
            conn.commit()
            if inserted:
                print(
                    f"[SEED] Backfilled {inserted} user_role assignment(s) from legacy users.role"
                )
        except Exception as e:
            print(f"[SEED ERROR] user_roles backfill: {e}")
            conn.rollback()


def init_db():
    """Initialize database tables"""
    Base.metadata.create_all(bind=engine)

    # Run migrations for existing databases
    run_migrations()

    # Seed RBAC system roles + backfill assignments from legacy users.role
    seed_rbac()
