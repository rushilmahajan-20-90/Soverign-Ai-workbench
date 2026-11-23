import logging
from typing import Optional

from app.db.database import get_pool
from app.auth.security import hash_password, verify_password

logger = logging.getLogger(__name__)


def create_user(
    username: str,
    display_name: str,
    password: Optional[str] = None,
    avatar_color: str = "#6366f1",
    role: str = "Member",
    email: Optional[str] = None,
) -> dict:
    username = username.strip().lower()
    display_name = display_name.strip()
    if not username:
        raise ValueError("Username cannot be empty.")
    if not display_name:
        display_name = username

    # Validate role strictly: Administrator or Member
    if role not in {"Administrator", "Member"}:
        role = "Member"

    # Default password if none provided
    plain_password = password.strip() if password else "password123"
    pwd_hash = hash_password(plain_password)

    if not email:
        email = f"{username}@vertex.local"

    with get_pool().connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO users (username, display_name, avatar_color, role, is_active, password_hash, email)
                VALUES (%s, %s, %s, %s, TRUE, %s, %s)
                RETURNING id, username, display_name, avatar_color, role, is_active, email, created_at, last_login_at
                """,
                (username[:50], display_name[:100], avatar_color[:7], role, pwd_hash, email[:100]),
            )
            row = cur.fetchone()

    return {
        "id": row[0],
        "username": row[1],
        "display_name": row[2],
        "avatar_color": row[3],
        "role": row[4],
        "is_active": row[5],
        "email": row[6],
        "created_at": row[7].isoformat() if row[7] else None,
        "last_login_at": row[8].isoformat() if row[8] else None,
    }


def list_users() -> list[dict]:
    with get_pool().connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, username, display_name, avatar_color, role, is_active, email, created_at, last_login_at
                FROM users
                ORDER BY id ASC
                """
            )
            rows = cur.fetchall()

    return [
        {
            "id": row[0],
            "username": row[1],
            "display_name": row[2],
            "avatar_color": row[3],
            "role": row[4],
            "is_active": row[5],
            "email": row[6],
            "created_at": row[7].isoformat() if row[7] else None,
            "last_login_at": row[8].isoformat() if row[8] else None,
        }
        for row in rows
    ]


def list_users_with_stats() -> list[dict]:
    """Retrieve all users with aggregated conversation, message, and document counts."""
    with get_pool().connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    u.id, u.username, u.display_name, u.avatar_color,
                    u.role, u.is_active, u.email, u.created_at, u.last_login_at,
                    COUNT(DISTINCT c.id) AS conversation_count,
                    COUNT(DISTINCT d.id) AS document_count
                FROM users u
                LEFT JOIN conversations c ON c.user_id = u.id
                LEFT JOIN documents d ON d.user_id = u.id
                GROUP BY u.id
                ORDER BY u.id ASC
                """
            )
            rows = cur.fetchall()

    return [
        {
            "id": row[0],
            "username": row[1],
            "display_name": row[2],
            "avatar_color": row[3],
            "role": row[4],
            "is_active": row[5],
            "email": row[6],
            "created_at": row[7].isoformat() if row[7] else None,
            "last_login_at": row[8].isoformat() if row[8] else None,
            "conversation_count": row[9],
            "document_count": row[10],
        }
        for row in rows
    ]


def get_user(user_id: int) -> Optional[dict]:
    with get_pool().connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, username, display_name, avatar_color, role, is_active, email, created_at, last_login_at
                FROM users
                WHERE id = %s
                """,
                (user_id,),
            )
            row = cur.fetchone()

    if row is None:
        return None

    return {
        "id": row[0],
        "username": row[1],
        "display_name": row[2],
        "avatar_color": row[3],
        "role": row[4],
        "is_active": row[5],
        "email": row[6],
        "created_at": row[7].isoformat() if row[7] else None,
        "last_login_at": row[8].isoformat() if row[8] else None,
    }


def get_user_by_username(username: str) -> Optional[dict]:
    """Retrieve user with password_hash for authentication verification."""
    username = username.strip().lower()
    with get_pool().connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, username, display_name, avatar_color, role, is_active, email, password_hash, created_at, last_login_at
                FROM users
                WHERE LOWER(username) = %s OR LOWER(email) = %s
                """,
                (username, username),
            )
            row = cur.fetchone()

    if row is None:
        return None

    return {
        "id": row[0],
        "username": row[1],
        "display_name": row[2],
        "avatar_color": row[3],
        "role": row[4],
        "is_active": row[5],
        "email": row[6],
        "password_hash": row[7],
        "created_at": row[8].isoformat() if row[8] else None,
        "last_login_at": row[9].isoformat() if row[9] else None,
    }


def update_user_last_login(user_id: int) -> None:
    """Record current timestamp as last login for user."""
    with get_pool().connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE users SET last_login_at = NOW(), updated_at = NOW() WHERE id = %s",
                (user_id,),
            )


def change_user_password(user_id: int, new_password: str) -> bool:
    """Change a user's password with a fresh bcrypt hash."""
    if not new_password or len(new_password) < 4:
        raise ValueError("Password must be at least 4 characters long.")
    pwd_hash = hash_password(new_password)
    with get_pool().connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE users SET password_hash = %s, updated_at = NOW() WHERE id = %s",
                (pwd_hash, user_id),
            )
            return cur.rowcount > 0


def update_user(
    user_id: int,
    display_name: str = None,
    avatar_color: str = None,
    role: str = None,
    is_active: bool = None,
    email: str = None,
) -> bool:
    sets = ["updated_at = NOW()"]
    params = []

    if display_name is not None:
        display_name = display_name.strip()
        if not display_name:
            raise ValueError("Display name cannot be empty.")
        sets.append("display_name = %s")
        params.append(display_name[:100])

    if avatar_color is not None:
        sets.append("avatar_color = %s")
        params.append(avatar_color[:7])

    if role is not None:
        if role not in {"Administrator", "Member"}:
            raise ValueError("Invalid role. Must be 'Administrator' or 'Member'.")
        sets.append("role = %s")
        params.append(role)

    if is_active is not None:
        sets.append("is_active = %s")
        params.append(bool(is_active))

    if email is not None:
        sets.append("email = %s")
        params.append(email.strip()[:100])

    params.append(user_id)

    with get_pool().connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"UPDATE users SET {', '.join(sets)} WHERE id = %s",
                params,
            )
            return cur.rowcount > 0


def delete_user(user_id: int) -> bool:
    with get_pool().connection() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM users WHERE id = %s", (user_id,))
            return cur.rowcount > 0


def set_user_role(user_id: int, role: str) -> bool:
    if role not in {"Administrator", "Member"}:
        raise ValueError("Invalid role. Must be 'Administrator' or 'Member'.")
    return update_user(user_id, role=role)


def set_user_active(user_id: int, is_active: bool) -> bool:
    return update_user(user_id, is_active=is_active)


# =========================================================
# WORKSPACE / ORGANIZATION SETTINGS
# =========================================================

def get_workspace_settings() -> dict:
    with get_pool().connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, org_name, workspace_domain, allow_member_upload, max_upload_size_mb, enforce_data_isolation, default_temperature, updated_at
                FROM workspace_settings
                WHERE id = 1
                """
            )
            row = cur.fetchone()
            if not row:
                cur.execute(
                    """
                    INSERT INTO workspace_settings (id, org_name, workspace_domain, default_temperature)
                    VALUES (1, 'Vertex Enterprise', 'vertex.local', 0.70)
                    RETURNING id, org_name, workspace_domain, allow_member_upload, max_upload_size_mb, enforce_data_isolation, default_temperature, updated_at
                    """
                )
                row = cur.fetchone()

    return {
        "id": row[0],
        "org_name": row[1],
        "workspace_domain": row[2],
        "allow_member_upload": row[3],
        "max_upload_size_mb": row[4],
        "enforce_data_isolation": row[5],
        "default_temperature": float(row[6]) if row[6] is not None else 0.70,
        "updated_at": row[7].isoformat() if row[7] else None,
    }


def update_workspace_settings(
    org_name: str = None,
    workspace_domain: str = None,
    allow_member_upload: bool = None,
    max_upload_size_mb: int = None,
    enforce_data_isolation: bool = None,
    default_temperature: float = None,
) -> dict:
    sets = ["updated_at = NOW()"]
    params = []

    if org_name is not None:
        sets.append("org_name = %s")
        params.append(org_name.strip()[:100] or "Vertex Enterprise")

    if workspace_domain is not None:
        sets.append("workspace_domain = %s")
        params.append(workspace_domain.strip()[:100] or "vertex.local")

    if allow_member_upload is not None:
        sets.append("allow_member_upload = %s")
        params.append(bool(allow_member_upload))

    if max_upload_size_mb is not None:
        sets.append("max_upload_size_mb = %s")
        params.append(max(1, min(100, int(max_upload_size_mb))))

    if enforce_data_isolation is not None:
        sets.append("enforce_data_isolation = %s")
        params.append(bool(enforce_data_isolation))

    if default_temperature is not None:
        sets.append("default_temperature = %s")
        params.append(round(max(0.0, min(2.0, float(default_temperature))), 2))

    with get_pool().connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"UPDATE workspace_settings SET {', '.join(sets)} WHERE id = 1",
                params,
            )

    return get_workspace_settings()
