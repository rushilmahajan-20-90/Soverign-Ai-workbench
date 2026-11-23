import os
import logging
from pathlib import Path

from dotenv import load_dotenv
from psycopg_pool import ConnectionPool

logger = logging.getLogger(__name__)

# Load the .env file from the project root.
PROJECT_ROOT = Path(__file__).resolve().parents[2]
load_dotenv(PROJECT_ROOT / ".env", override=True)

DATABASE_URL = os.getenv("DATABASE_URL")
_pool = None


def get_pool() -> ConnectionPool:
    """Return the initialized PostgreSQL connection pool."""
    if _pool is None:
        raise RuntimeError(
            "Database pool is not initialized. "
            "Call init_db() during application startup."
        )
    return _pool


def init_db() -> None:
    """Initialize and verify the PostgreSQL connection pool."""
    global _pool

    if _pool is not None:
        logger.info("PostgreSQL pool is already initialized.")
        return

    if not DATABASE_URL:
        raise RuntimeError(
            "DATABASE_URL is missing from the project .env file."
        )

    logger.info("Initializing PostgreSQL connection pool...")

    pool = ConnectionPool(
        conninfo=DATABASE_URL,
        min_size=1,
        max_size=5,
        open=False,
    )

    try:
        pool.open(wait=True, timeout=10)

        with pool.connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT current_database(), current_user, "
                    "inet_server_port()"
                )
                database, username, port = cur.fetchone()

        _pool = pool

        logger.warning(
            "POSTGRESQL CONNECTED: database=%s user=%s port=%s",
            database,
            username,
            port,
        )

        # Ensure required tables exist.
        with pool.connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    CREATE TABLE IF NOT EXISTS users (
                        id SERIAL PRIMARY KEY,
                        username VARCHAR(50) UNIQUE NOT NULL,
                        display_name VARCHAR(100) NOT NULL,
                        avatar_color VARCHAR(7) DEFAULT '#6366f1',
                        role VARCHAR(20) NOT NULL DEFAULT 'Member',
                        is_active BOOLEAN NOT NULL DEFAULT TRUE,
                        password_hash VARCHAR(255),
                        email VARCHAR(100),
                        last_login_at TIMESTAMPTZ,
                        created_at TIMESTAMPTZ DEFAULT NOW(),
                        updated_at TIMESTAMPTZ DEFAULT NOW()
                    )
                """)
                cur.execute("""
                    CREATE TABLE IF NOT EXISTS conversations (
                        id SERIAL PRIMARY KEY,
                        title VARCHAR(255) NOT NULL DEFAULT 'New conversation',
                        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                        project_id VARCHAR(100),
                        created_at TIMESTAMPTZ DEFAULT NOW(),
                        updated_at TIMESTAMPTZ DEFAULT NOW()
                    )
                """)
                cur.execute("""
                    CREATE TABLE IF NOT EXISTS messages (
                        id SERIAL PRIMARY KEY,
                        conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
                        role VARCHAR(20) NOT NULL,
                        content TEXT NOT NULL,
                        created_at TIMESTAMPTZ DEFAULT NOW()
                    )
                """)
                cur.execute("""
                    CREATE TABLE IF NOT EXISTS documents (
                        id SERIAL PRIMARY KEY,
                        filename VARCHAR(255) UNIQUE NOT NULL,
                        original_filename VARCHAR(255) NOT NULL,
                        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                        file_type VARCHAR(20) DEFAULT 'pdf',
                        file_size INTEGER DEFAULT 0,
                        chunk_count INTEGER DEFAULT 0,
                        is_shared BOOLEAN NOT NULL DEFAULT FALSE,
                        shared_with_user_ids INTEGER[] DEFAULT ARRAY[]::INTEGER[],
                        created_at TIMESTAMPTZ DEFAULT NOW(),
                        updated_at TIMESTAMPTZ DEFAULT NOW()
                    )
                """)
                cur.execute("""
                    CREATE TABLE IF NOT EXISTS audit_logs (
                        id SERIAL PRIMARY KEY,
                        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                        username VARCHAR(50),
                        display_name VARCHAR(100),
                        role VARCHAR(20) DEFAULT 'Member',
                        action VARCHAR(50) NOT NULL,
                        resource_type VARCHAR(50),
                        resource_id VARCHAR(100),
                        resource_name VARCHAR(255),
                        details JSONB DEFAULT '{}'::jsonb,
                        status VARCHAR(20) DEFAULT 'success',
                        ip_address VARCHAR(45),
                        created_at TIMESTAMPTZ DEFAULT NOW()
                    )
                """)
                cur.execute("""
                    CREATE TABLE IF NOT EXISTS workspace_settings (
                        id SERIAL PRIMARY KEY,
                        org_name VARCHAR(100) NOT NULL DEFAULT 'Vertex Enterprise',
                        workspace_domain VARCHAR(100) NOT NULL DEFAULT 'vertex.local',
                        allow_member_upload BOOLEAN NOT NULL DEFAULT TRUE,
                        max_upload_size_mb INTEGER NOT NULL DEFAULT 50,
                        enforce_data_isolation BOOLEAN NOT NULL DEFAULT TRUE,
                        updated_at TIMESTAMPTZ DEFAULT NOW()
                    )
                """)
                cur.execute("""
                    INSERT INTO workspace_settings (id, org_name, workspace_domain)
                    VALUES (1, 'Vertex Enterprise', 'vertex.local')
                    ON CONFLICT (id) DO NOTHING;
                """)

                # Indexes
                cur.execute("CREATE INDEX IF NOT EXISTS idx_audit_user_id ON audit_logs(user_id);")
                cur.execute("CREATE INDEX IF NOT EXISTS idx_audit_created_at ON audit_logs(created_at DESC);")
                cur.execute("CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action);")
                cur.execute("CREATE INDEX IF NOT EXISTS idx_documents_user_id ON documents(user_id);")
                cur.execute("CREATE INDEX IF NOT EXISTS idx_documents_is_shared ON documents(is_shared);")

                # Migrations for existing deployments
                try:
                    cur.execute("""
                        ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'Member';
                        ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
                        ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);
                        ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(100);
                        ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;
                        ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

                        -- Knowledge Base vs Temporary Chat Documents Migration
                        ALTER TABLE documents ADD COLUMN IF NOT EXISTS is_temporary BOOLEAN NOT NULL DEFAULT FALSE;
                        ALTER TABLE documents ADD COLUMN IF NOT EXISTS conversation_id INTEGER REFERENCES conversations(id) ON DELETE CASCADE;
                        ALTER TABLE documents ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'Indexed';
                        ALTER TABLE documents ADD COLUMN IF NOT EXISTS last_indexed_at TIMESTAMPTZ DEFAULT NOW();
                        ALTER TABLE documents ADD COLUMN IF NOT EXISTS access_scope VARCHAR(50) DEFAULT 'Authorized company users';
                        CREATE INDEX IF NOT EXISTS idx_documents_is_temporary ON documents(is_temporary);
                        CREATE INDEX IF NOT EXISTS idx_documents_conversation_id ON documents(conversation_id);

                        -- Project Conversations Migration
                        ALTER TABLE conversations ADD COLUMN IF NOT EXISTS project_id VARCHAR(100);
                        CREATE INDEX IF NOT EXISTS idx_conversations_project_id ON conversations(project_id);

                        -- Workspace Temperature Settings Migration
                        ALTER TABLE workspace_settings ADD COLUMN IF NOT EXISTS default_temperature NUMERIC(3, 2) NOT NULL DEFAULT 0.70;
                    """)
                except Exception as alter_user_exc:
                    logger.warning("Could not alter users table: %s", alter_user_exc)

                try:
                    cur.execute("""
                        DO $$
                        BEGIN
                            IF NOT EXISTS (
                                SELECT 1 FROM information_schema.columns
                                WHERE table_name = 'conversations' AND column_name = 'user_id'
                            ) THEN
                                ALTER TABLE conversations
                                ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE CASCADE;
                            END IF;
                        END $$
                    """)
                except Exception as alter_exc:
                    logger.warning("Could not add user_id column: %s", alter_exc)

                # Seed Administrator and Member with real bcrypt password hashes
                try:
                    import bcrypt
                    admin_hash = bcrypt.hashpw(b"admin123", bcrypt.gensalt(12)).decode("utf-8")
                    member_hash = bcrypt.hashpw(b"alex123", bcrypt.gensalt(12)).decode("utf-8")
                    default_hash = bcrypt.hashpw(b"password123", bcrypt.gensalt(12)).decode("utf-8")

                    # Upsert default Administrator
                    cur.execute("""
                        INSERT INTO users (username, display_name, avatar_color, role, is_active, password_hash, email)
                        VALUES ('admin', 'System Administrator', '#6366f1', 'Administrator', TRUE, %s, 'admin@vertex.local')
                        ON CONFLICT (username) DO UPDATE SET
                            role = 'Administrator',
                            password_hash = COALESCE(users.password_hash, EXCLUDED.password_hash);
                    """, (admin_hash,))

                    # Upsert default Member Alex Kumar
                    cur.execute("""
                        INSERT INTO users (username, display_name, avatar_color, role, is_active, password_hash, email)
                        VALUES ('alex', 'Alex Kumar', '#22c55e', 'Member', TRUE, %s, 'alex@vertex.local')
                        ON CONFLICT (username) DO UPDATE SET
                            role = 'Member',
                            password_hash = COALESCE(users.password_hash, EXCLUDED.password_hash);
                    """, (member_hash,))

                    # Update any legacy users with no password_hash to default password
                    cur.execute("""
                        UPDATE users
                        SET password_hash = %s
                        WHERE password_hash IS NULL;
                    """, (default_hash,))

                except Exception as seed_exc:
                    logger.warning("Could not seed users: %s", seed_exc)

            conn.commit()

        logger.info("Database tables verified.")

    except Exception:
        pool.close()
        logger.exception("POSTGRESQL CONNECTION FAILED.")
        raise


def close_db() -> None:
    """Close the database pool during application shutdown."""
    global _pool

    if _pool is not None:
        _pool.close()
        _pool = None
        logger.warning("PostgreSQL connection pool closed.")
