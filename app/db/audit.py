import json
import logging
from typing import Optional
from datetime import datetime

from app.db.database import get_pool

logger = logging.getLogger(__name__)


def log_audit_event(
    user_id: Optional[int] = None,
    username: Optional[str] = None,
    display_name: Optional[str] = None,
    role: Optional[str] = None,
    action: str = "unknown",
    resource_type: Optional[str] = None,
    resource_id: Optional[str] = None,
    resource_name: Optional[str] = None,
    details: Optional[dict] = None,
    status: str = "success",
    ip_address: Optional[str] = None,
) -> Optional[int]:
    """
    Record an enterprise audit event in PostgreSQL.
    """
    try:
        details_json = json.dumps(details or {})

        with get_pool().connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO audit_logs (
                        user_id, username, display_name, role, action,
                        resource_type, resource_id, resource_name,
                        details, status, ip_address
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb, %s, %s)
                    RETURNING id
                    """,
                    (
                        user_id,
                        (username or "")[:50] or None,
                        (display_name or "")[:100] or None,
                        (role or "Member")[:20],
                        action[:50],
                        (resource_type or "")[:50] or None,
                        (str(resource_id) if resource_id is not None else "")[:100] or None,
                        (resource_name or "")[:255] or None,
                        details_json,
                        status[:20],
                        (ip_address or "")[:45] or None,
                    ),
                )
                row = cur.fetchone()
                return row[0] if row else None
    except Exception as exc:
        logger.exception("Failed to write audit log event '%s': %s", action, exc)
        return None


def list_audit_logs(
    limit: int = 50,
    offset: int = 0,
    user_id: Optional[int] = None,
    action: Optional[str] = None,
    resource_type: Optional[str] = None,
    search: Optional[str] = None,
) -> dict:
    """
    Retrieve paginated audit logs with optional filters.
    """
    limit = max(1, min(limit, 200))
    offset = max(0, offset)

    where_clauses = []
    params = []

    if user_id is not None:
        where_clauses.append("a.user_id = %s")
        params.append(user_id)

    if action and action != "ALL":
        where_clauses.append("a.action = %s")
        params.append(action)

    if resource_type and resource_type != "ALL":
        where_clauses.append("a.resource_type = %s")
        params.append(resource_type)

    if search:
        search_pattern = f"%{search.strip().lower()}%"
        where_clauses.append(
            "(LOWER(a.username) LIKE %s OR LOWER(a.display_name) LIKE %s "
            "OR LOWER(a.action) LIKE %s OR LOWER(a.resource_name) LIKE %s)"
        )
        params.extend([search_pattern, search_pattern, search_pattern, search_pattern])

    where_sql = ("WHERE " + " AND ".join(where_clauses)) if where_clauses else ""

    with get_pool().connection() as conn:
        with conn.cursor() as cur:
            # Count total
            count_sql = f"SELECT COUNT(*) FROM audit_logs a {where_sql}"
            cur.execute(count_sql, params)
            total_count = cur.fetchone()[0]

            # Fetch items
            fetch_sql = f"""
                SELECT
                    a.id, a.user_id, a.username, a.display_name, a.role,
                    a.action, a.resource_type, a.resource_id, a.resource_name,
                    a.details, a.status, a.ip_address, a.created_at
                FROM audit_logs a
                {where_sql}
                ORDER BY a.created_at DESC, a.id DESC
                LIMIT %s OFFSET %s
            """
            cur.execute(fetch_sql, params + [limit, offset])
            rows = cur.fetchall()

    logs = [
        {
            "id": r[0],
            "user_id": r[1],
            "username": r[2],
            "display_name": r[3],
            "role": r[4],
            "action": r[5],
            "resource_type": r[6],
            "resource_id": r[7],
            "resource_name": r[8],
            "details": r[9] if isinstance(r[9], dict) else {},
            "status": r[10],
            "ip_address": r[11],
            "created_at": r[12].isoformat() if r[12] else None,
        }
        for r in rows
    ]

    return {
        "total": total_count,
        "limit": limit,
        "offset": offset,
        "logs": logs,
    }


def get_user_audit_logs(user_id: int, limit: int = 50) -> list[dict]:
    """
    Retrieve chronological audit logs for a single user.
    """
    res = list_audit_logs(limit=limit, offset=0, user_id=user_id)
    return res["logs"]


def get_audit_stats() -> dict:
    """
    Get summary metrics for the Admin Dashboard.
    """
    with get_pool().connection() as conn:
        with conn.cursor() as cur:
            # Total events
            cur.execute("SELECT COUNT(*) FROM audit_logs")
            total_events = cur.fetchone()[0]

            # Events in last 24h
            cur.execute(
                "SELECT COUNT(*) FROM audit_logs WHERE created_at >= NOW() - INTERVAL '24 hours'"
            )
            events_24h = cur.fetchone()[0]

            # Logins in last 24h
            cur.execute(
                """
                SELECT COUNT(*) FROM audit_logs
                WHERE action = 'login' AND created_at >= NOW() - INTERVAL '24 hours'
                """
            )
            logins_24h = cur.fetchone()[0]

            # Recent 10 actions
            cur.execute(
                """
                SELECT id, user_id, username, display_name, role, action,
                       resource_type, resource_name, status, created_at
                FROM audit_logs
                ORDER BY created_at DESC
                LIMIT 10
                """
            )
            recent_rows = cur.fetchall()

    recent_activities = [
        {
            "id": r[0],
            "user_id": r[1],
            "username": r[2],
            "display_name": r[3],
            "role": r[4],
            "action": r[5],
            "resource_type": r[6],
            "resource_name": r[7],
            "status": r[8],
            "created_at": r[9].isoformat() if r[9] else None,
        }
        for r in recent_rows
    ]

    return {
        "total_events": total_events,
        "events_24h": events_24h,
        "logins_24h": logins_24h,
        "recent_activities": recent_activities,
    }
