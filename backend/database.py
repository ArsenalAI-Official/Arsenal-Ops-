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
        # Migration: Add category_id column to projects (links to
        # project_categories, ON DELETE SET NULL so removing a category
        # quietly unassigns its projects). The project_categories table
        # itself is created by Base.metadata.create_all on first startup
        # after this model lands.
        try:
            result = conn.execute(
                text("""
                SELECT column_name
                FROM information_schema.columns
                WHERE table_name = 'projects' AND column_name = 'category_id'
            """)
            )
            if not result.fetchone():
                print("[MIGRATION] Adding category_id column to projects...")
                conn.execute(
                    text("""
                    ALTER TABLE projects
                    ADD COLUMN category_id INTEGER
                    REFERENCES project_categories(id) ON DELETE SET NULL
                """)
                )
                conn.execute(
                    text(
                        "CREATE INDEX IF NOT EXISTS ix_projects_category_id ON projects(category_id)"
                    )
                )
                conn.commit()
                print("[MIGRATION] category_id column + index added successfully!")
        except Exception as e:
            print(f"[MIGRATION ERROR] projects.category_id: {e}")

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
            "project.tracker_write",
            "project.board",
            "project.calendar",
            "project.pulse",
            "project.activity",
            "project.ai.write",
            "project.create",
            "project.assign_personal_task",
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

        # One-shot: bring the developer role forward to its current canonical
        # grant set when it exactly matches a known prior canonical state.
        # Skipped silently when an admin has customised the role, so we never
        # re-grant something they deliberately removed.
        #
        # Each prior state below is a frozen snapshot from a specific point
        # in the write-RBAC rollout. When grants exactly match one of them,
        # the missing caps are inserted to reach `CANONICAL_DEV_GRANTS`. After
        # one successful run, `current` equals the canonical set and no branch
        # matches on subsequent startups — so it's idempotent.
        try:
            BASE_READ_GRANTS = {
                "project.overview.*",
                "project.tracker.*",
                "project.calendar",
                "project.pulse",
                "project.activity",
            }
            PRIOR_DEV_STATES = [
                # 5 entries: pre-write-RBAC era
                BASE_READ_GRANTS,
                # 6 entries: after the ai.write one-shot, before tracker_write
                #            was hoisted out of `project.tracker.*`
                BASE_READ_GRANTS | {"project.ai.write"},
                # 7 entries: after tracker_write rename, before project.create
                #            + project.assign_personal_task were added
                BASE_READ_GRANTS | {"project.ai.write", "project.tracker_write"},
                # 9 entries: after project.create + assign_personal_task were
                #            added, before project.board was split out of the
                #            tracker. `reconcile_project_board_cap` covers the
                #            same case via a separate path; listing it here
                #            keeps the seed_rbac one-shot able to bring the
                #            role forward even if that migration is removed.
                BASE_READ_GRANTS
                | {
                    "project.ai.write",
                    "project.tracker_write",
                    "project.create",
                    "project.assign_personal_task",
                },
            ]
            CANONICAL_DEV_GRANTS = {g for n, _, gs in SYSTEM_ROLES if n == "developer" for g in gs}
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
                if current in PRIOR_DEV_STATES:
                    to_add = sorted(CANONICAL_DEV_GRANTS - current)
                    for g in to_add:
                        conn.execute(
                            text(
                                "INSERT INTO role_capabilities (role_id, capability_key) "
                                "VALUES (:rid, :g)"
                            ),
                            {"rid": dev_id, "g": g},
                        )
                    if to_add:
                        conn.commit()
                        print(f"[SEED] Added {to_add} to existing 'developer' role")
        except Exception as e:
            print(f"[SEED ERROR] developer write-caps upgrade: {e}")
            conn.rollback()

        # One-shot: rewrite any stale `project.tracker.write` rows to the
        # post-rename key `project.tracker_write`. The cap was renamed so that
        # the read wildcard `project.tracker.*` no longer auto-covers it;
        # stale rows would fail save-side validation (`is_valid_grant`).
        try:
            result = conn.execute(
                text(
                    "UPDATE role_capabilities "
                    "SET capability_key = 'project.tracker_write' "
                    "WHERE capability_key = 'project.tracker.write'"
                )
            )
            if result.rowcount:
                conn.commit()
                print(
                    f"[SEED] Rewrote {result.rowcount} stale 'project.tracker.write' "
                    "row(s) to 'project.tracker_write'"
                )
        except Exception as e:
            print(f"[SEED ERROR] tracker_write rename rewrite: {e}")
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


def mark_migration_applied(name: str, db) -> bool:
    """Idempotency gate for one-shot data migrations.

    Returns True the FIRST time a given migration name is seen — the caller
    should then proceed with its work. Returns False on every subsequent
    call, signalling "already applied, skip."

    The marker row is committed BEFORE the caller does its mutations. That
    ordering means:

      - On a clean first run: marker committed → migration body runs → if
        the body fails partway, the marker is still set and the body will
        not re-run on boot. Therefore the migration body MUST be internally
        idempotent (skip rows it's already touched) — see the existing
        reconcile functions for the pattern.

      - On any later boot: marker is found → return False → body skips.

    `db` is a `Session`; the caller owns its lifecycle. We commit only the
    one marker row here and roll back on conflict so the caller's
    subsequent commits are independent.

    See `models/applied_migration.py` for the table + naming convention.
    """
    from models.applied_migration import AppliedMigration

    # Race-tolerant insert: two processes booting in parallel both pass the
    # existence check, then both INSERT — the second one hits the primary
    # key and we return False. Without this guard the second process would
    # double-run the migration body.
    existing = db.query(AppliedMigration).filter(AppliedMigration.name == name).first()
    if existing:
        return False
    try:
        db.add(AppliedMigration(name=name))
        db.commit()
    except Exception:
        # Most likely a duplicate-key from a parallel boot. Treat as
        # already-applied — the other process is doing (or has done) the
        # work, and re-running is unnecessary.
        db.rollback()
        return False
    return True


def _allowed_internal_domains() -> list[str]:
    """Parsed ALLOWED_EMAIL_DOMAINS, lowercased, empty entries dropped.

    Single source of truth shared by SSO/Add User code paths and the
    reconciliation below. Default matches the historical fallback so behaviour
    is unchanged when the env var isn't set.
    """
    return [
        d.strip().lower()
        for d in os.getenv("ALLOWED_EMAIL_DOMAINS", "arsenalai.com").split(",")
        if d.strip()
    ]


def reconcile_internal_developers():
    """Ensure every internal-domain User has a matching Developer row marked
    internal, and flip any internal-domain Developer that drifted to external.

    Why: the Employees tab filters `Developer.is_external == False`. Adding a
    non-developer-role user via Add User used to skip Developer creation,
    leaving internal employees invisible in that tab. This pass fixes both
    historical gaps and any future drift.

    Idempotent: runs every startup but only mutates rows that need it.
    ORM-based so it works on both Postgres (production) and SQLite (local dev).
    """
    from models.developer import Developer
    from models.user import User

    allowed = _allowed_internal_domains()
    if not allowed:
        return

    def is_internal(email: str | None) -> bool:
        if not email or "@" not in email:
            return False
        return email.rsplit("@", 1)[-1].lower() in allowed

    db = SessionLocal()
    try:
        # Pass 1: flip internal-domain Developers that were mis-flagged external.
        flipped = 0
        externals = db.query(Developer).filter(Developer.is_external.is_(True)).all()
        for dev in externals:
            if is_internal(dev.email):
                dev.is_external = False
                flipped += 1

        # Pass 2: insert missing Developer rows for internal-domain Users.
        # One query for existing Developer emails (set membership beats N selects).
        existing_dev_emails = {
            email for (email,) in db.query(Developer.email).all() if email is not None
        }
        inserted = 0
        internal_users = (
            db.query(User).filter(User.email.isnot(None)).all()
        )  # is_internal handles the domain check
        for user in internal_users:
            if not is_internal(user.email):
                continue
            if user.email in existing_dev_emails:
                continue
            db.add(Developer(name=user.name, email=user.email, is_external=False))
            existing_dev_emails.add(user.email)
            inserted += 1

        if flipped or inserted:
            db.commit()
            if flipped:
                print(
                    f"[RECONCILE] Flipped {flipped} internal-domain developer(s) "
                    "from external to internal"
                )
            if inserted:
                print(
                    f"[RECONCILE] Backfilled {inserted} Developer row(s) "
                    "for internal-domain User(s)"
                )
    except Exception as e:
        db.rollback()
        print(f"[RECONCILE ERROR] internal-domain developer reconciliation: {e}")
    finally:
        db.close()


def _reconcile_user_roles_impl(db) -> int:
    """Pure backfill logic. Returns the number of users newly linked.

    Split out from `reconcile_user_roles` so tests can drive it against an
    in-memory SQLite Session without monkey-patching SessionLocal.
    """
    from sqlalchemy.orm import selectinload

    from models.role import Role
    from models.user import User

    # Eager-load user.roles so the empty-check below doesn't fire N
    # lazy-load SELECTs against user_roles.
    users = (
        db.query(User)
        .options(selectinload(User.roles))
        .filter(User.role.isnot(None))
        .filter(User.role != "")
        .all()
    )
    if not users:
        return 0

    role_by_name = {r.name: r for r in db.query(Role).all()}
    if not role_by_name:
        return 0

    fixed = 0
    for user in users:
        if user.roles:  # already linked (fully or partially), skip
            continue
        names = [n.strip() for n in (user.role or "").split(",") if n.strip()]
        linked = False
        for name in names:
            role = role_by_name.get(name)
            if role is not None:
                user.roles.append(role)
                linked = True
        if linked:
            fixed += 1
    return fixed


def reconcile_user_roles():
    """Backfill user_roles for any User whose legacy `role` string names a
    known system Role but has zero entries in the many-to-many user_roles
    table.

    Why: `User.has_capability` reads from `user.roles` (the m2m), not
    `user.role` (the legacy comma-string). Users created via the SSO and
    Add User paths historically only set the string — leaving them with zero
    effective capabilities regardless of what their role grants.

    Idempotent: only touches users whose `user_roles` row count is zero.
    The one-shot seed_rbac backfill at lines ~889-919 already handles the
    initial migration; this catches every user created afterwards by paths
    that forgot to write the m2m link.

    Conservative on partial mismatches: a user with `role="admin,developer"`
    but only the admin link present is left alone — we never override what
    looks like a deliberate admin adjustment. The fix is "either fully
    linked or fully empty"; partial states are preserved.
    """
    db = SessionLocal()
    try:
        fixed = _reconcile_user_roles_impl(db)
        if fixed:
            db.commit()
            print(
                f"[RECONCILE] Linked {fixed} user(s) to their system Role(s) "
                "from legacy users.role string"
            )
    except Exception as e:
        db.rollback()
        print(f"[RECONCILE ERROR] user_roles backfill: {e}")
    finally:
        db.close()


def reconcile_project_board_cap():
    """One-shot backfill: grants `project.board` to roles that held the
    pre-split tracker caps (`project.tracker.*` or `project.tracker_write`).

    Why: before the read/write split, anyone who could view the tracker tab
    could also navigate to the Project Board page (there was no read gate).
    After the split, that page requires `project.board`, which roles
    holding only tracker caps don't have — and the tracker wildcard does
    NOT cover board (board isn't a sub-cap of tracker). Without this
    backfill, every developer role user would lose Open Board access on
    deploy.

    Gated by the `applied_migrations` table so it runs at most once per
    database. After it has applied, an admin who deliberately removes
    `project.board` from a role won't have it re-added on next boot.

    Wildcards (`*`, `project.*`) need no update — they already cover
    `project.board` via prefix match.
    """
    from models.role import Role, RoleCapability

    TRIGGER_CAPS = {"project.tracker.*", "project.tracker_write"}
    TARGET = "project.board"
    MIGRATION_NAME = "reconcile_project_board_cap_v1"

    db = SessionLocal()
    try:
        if not mark_migration_applied(MIGRATION_NAME, db):
            return  # already applied — admin owns role caps from here on

        all_caps = db.query(RoleCapability).all()
        held: dict[int, set[str]] = {}
        for rc in all_caps:
            held.setdefault(rc.role_id, set()).add(rc.capability_key)

        affected_role_ids: list[int] = []
        for role_id, keys in held.items():
            if TARGET in keys:
                continue
            if keys & TRIGGER_CAPS:
                db.add(RoleCapability(role_id=role_id, capability_key=TARGET))
                affected_role_ids.append(role_id)

        if affected_role_ids:
            db.commit()
            names = {
                r.id: r.name
                for r in db.query(Role).filter(Role.id.in_(set(affected_role_ids))).all()
            }
            pretty = ", ".join(sorted({names.get(rid, str(rid)) for rid in affected_role_ids}))
            print(
                f"[MIGRATION {MIGRATION_NAME}] Granted `project.board` to "
                f"{len(affected_role_ids)} role(s): {pretty}"
            )
        else:
            print(f"[MIGRATION {MIGRATION_NAME}] No roles needed backfill (first run).")
    except Exception as e:
        db.rollback()
        print(f"[MIGRATION ERROR] {MIGRATION_NAME}: {e}")
    finally:
        db.close()


def reconcile_admin_write_caps():
    """One-shot backfill: grants `admin.*_write` caps to roles that held
    the pre-split combined cap (`admin.employees` / `admin.projects` /
    `admin.users` / `admin.roles`).

    Why: before the read/write split, those four combined keys gated both
    GETs and writes. After the split they gate only GETs, and a new
    `_write` key gates writes. Without this backfill, any custom role
    that had `admin.employees` (etc.) would lose its create/edit/delete
    ability on deploy.

    Gated by the `applied_migrations` table so it runs at most once per
    database. After it has applied, deliberately removing a `*_write` cap
    from a role to make it read-only is respected forever.

    Wildcards (`*`, `admin.*`) already cover the new caps and aren't
    enumerated by this migration — only explicit grants are backfilled.
    """
    from sqlalchemy.orm import Session

    from models.role import Role, RoleCapability

    # Map: combined-read cap → paired write cap to ensure
    PAIRS = {
        "admin.employees": "admin.employees_write",
        "admin.projects": "admin.projects_write",
        "admin.users": "admin.users_write",
        "admin.roles": "admin.roles_write",
    }
    MIGRATION_NAME = "reconcile_admin_write_caps_v1"

    db: Session = SessionLocal()
    try:
        if not mark_migration_applied(MIGRATION_NAME, db):
            return  # already applied — admin owns role caps from here on

        # One scan over RoleCapability is enough — we keep a per-role set of
        # held keys, then insert any missing paired writes inside a single
        # transaction.
        all_caps = db.query(RoleCapability).all()
        held: dict[int, set[str]] = {}
        for rc in all_caps:
            held.setdefault(rc.role_id, set()).add(rc.capability_key)

        inserted = 0
        affected_role_ids: list[int] = []
        for role_id, keys in held.items():
            for read_cap, write_cap in PAIRS.items():
                if read_cap in keys and write_cap not in keys:
                    db.add(RoleCapability(role_id=role_id, capability_key=write_cap))
                    keys.add(write_cap)
                    inserted += 1
                    affected_role_ids.append(role_id)

        if inserted:
            db.commit()
            # Resolve role names for the log line — single query, only fires
            # when we actually changed something.
            names = {
                r.id: r.name
                for r in db.query(Role).filter(Role.id.in_(set(affected_role_ids))).all()
            }
            pretty = ", ".join(sorted({names.get(rid, str(rid)) for rid in affected_role_ids}))
            print(
                f"[MIGRATION {MIGRATION_NAME}] Granted {inserted} admin *_write "
                f"cap(s) to role(s): {pretty}"
            )
        else:
            print(f"[MIGRATION {MIGRATION_NAME}] No roles needed backfill (first run).")
    except Exception as e:
        db.rollback()
        print(f"[MIGRATION ERROR] {MIGRATION_NAME}: {e}")
    finally:
        db.close()


def init_db():
    """Initialize database tables"""
    Base.metadata.create_all(bind=engine)

    # Run migrations for existing databases
    run_migrations()

    # Seed RBAC system roles + backfill assignments from legacy users.role
    seed_rbac()

    # Reconcile Developer rows so the Employees tab reflects every internal-
    # domain User (drops the historical "developer role required" gap).
    reconcile_internal_developers()

    # Backfill user_roles for users created by paths that forgot to write
    # the m2m link (Add User, SSO new-user). Without this, has_capability
    # returns False for everything even when their legacy role string says
    # "developer" or "admin".
    reconcile_user_roles()

    # One-shot backfills for the read/write cap split. Each is gated by
    # the `applied_migrations` table — they run exactly once per database,
    # then never again. After the first successful run, admin role
    # customizations (e.g. deliberately removing a `*_write` cap to make a
    # role read-only) are preserved forever. See
    # `models/applied_migration.py` for the pattern.
    reconcile_admin_write_caps()
    reconcile_project_board_cap()
