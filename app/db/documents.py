import logging
from typing import Optional

from app.db.database import get_pool

logger = logging.getLogger(__name__)


def register_document(
    filename: str,
    original_filename: str,
    user_id: Optional[int] = None,
    file_type: str = "pdf",
    file_size: int = 0,
    chunk_count: int = 0,
    is_shared: bool = False,
    is_temporary: bool = False,
    conversation_id: Optional[int] = None,
    status: str = "Indexed",
    access_scope: str = "Authorized company users",
) -> dict:
    """
    Register or update document ownership and metadata in PostgreSQL.
    Strictly separates Knowledge Base (permanent) vs Chat Temporary documents.
    """
    with get_pool().connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO documents (
                    filename, original_filename, user_id, file_type,
                    file_size, chunk_count, is_shared, is_temporary,
                    conversation_id, status, access_scope, last_indexed_at, updated_at
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW(), NOW())
                ON CONFLICT (filename) DO UPDATE SET
                    original_filename = EXCLUDED.original_filename,
                    user_id = COALESCE(EXCLUDED.user_id, documents.user_id),
                    file_type = EXCLUDED.file_type,
                    file_size = EXCLUDED.file_size,
                    chunk_count = EXCLUDED.chunk_count,
                    is_temporary = EXCLUDED.is_temporary,
                    conversation_id = EXCLUDED.conversation_id,
                    status = EXCLUDED.status,
                    access_scope = EXCLUDED.access_scope,
                    last_indexed_at = NOW(),
                    updated_at = NOW()
                RETURNING id, filename, original_filename, user_id, file_type,
                          file_size, chunk_count, is_shared, is_temporary,
                          conversation_id, status, last_indexed_at, access_scope, created_at
                """,
                (
                    filename,
                    original_filename,
                    user_id,
                    file_type[:20],
                    file_size,
                    chunk_count,
                    is_shared,
                    is_temporary,
                    conversation_id,
                    status[:20],
                    access_scope[:50],
                ),
            )
            row = cur.fetchone()

    return {
        "id": row[0],
        "filename": row[1],
        "original_filename": row[2],
        "user_id": row[3],
        "file_type": row[4],
        "file_size": row[5],
        "chunk_count": row[6],
        "is_shared": row[7],
        "is_temporary": row[8],
        "conversation_id": row[9],
        "status": row[10] or "Indexed",
        "last_indexed_at": row[11].isoformat() if row[11] else None,
        "access_scope": row[12] or "Authorized company users",
        "created_at": row[13].isoformat() if row[13] else None,
    }


def get_document_record(filename: str) -> Optional[dict]:
    """Retrieve document metadata by filename."""
    with get_pool().connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    d.id, d.filename, d.original_filename, d.user_id,
                    d.file_type, d.file_size, d.chunk_count, d.is_shared,
                    d.shared_with_user_ids, d.is_temporary, d.conversation_id,
                    d.status, d.last_indexed_at, d.access_scope, d.created_at,
                    u.username, u.display_name
                FROM documents d
                LEFT JOIN users u ON u.id = d.user_id
                WHERE d.filename = %s
                """,
                (filename,),
            )
            row = cur.fetchone()

    if not row:
        return None

    return {
        "id": row[0],
        "filename": row[1],
        "original_filename": row[2],
        "user_id": row[3],
        "file_type": row[4],
        "file_size": row[5],
        "chunk_count": row[6],
        "is_shared": row[7],
        "shared_with_user_ids": row[8] or [],
        "is_temporary": row[9] or False,
        "conversation_id": row[10],
        "status": row[11] or "Indexed",
        "last_indexed_at": row[12].isoformat() if row[12] else None,
        "access_scope": row[13] or "Authorized company users",
        "created_at": row[14].isoformat() if row[14] else None,
        "owner_username": row[15],
        "owner_display_name": row[16],
    }


def list_documents_for_user(
    user_id: Optional[int],
    is_admin: bool = False,
    limit: int = 100,
    offset: int = 0,
) -> list[dict]:
    """
    List documents permitted for the caller.
    Administrators see all documents.
    Members see owned documents and documents shared with workspace or their ID.
    """
    with get_pool().connection() as conn:
        with conn.cursor() as cur:
            if is_admin:
                cur.execute(
                    """
                    SELECT
                        d.id, d.filename, d.original_filename, d.user_id,
                        d.file_type, d.file_size, d.chunk_count, d.is_shared,
                        d.shared_with_user_ids, d.created_at,
                        u.username, u.display_name
                    FROM documents d
                    LEFT JOIN users u ON u.id = d.user_id
                    ORDER BY d.created_at DESC
                    LIMIT %s OFFSET %s
                    """,
                    (limit, offset),
                )
            else:
                cur.execute(
                    """
                    SELECT
                        d.id, d.filename, d.original_filename, d.user_id,
                        d.file_type, d.file_size, d.chunk_count, d.is_shared,
                        d.shared_with_user_ids, d.created_at,
                        u.username, u.display_name
                    FROM documents d
                    LEFT JOIN users u ON u.id = d.user_id
                    WHERE d.user_id = %s
                       OR d.is_shared = TRUE
                       OR (%s = ANY(COALESCE(d.shared_with_user_ids, ARRAY[]::INTEGER[])))
                    ORDER BY d.created_at DESC
                    LIMIT %s OFFSET %s
                    """,
                    (user_id, user_id, limit, offset),
                )
            rows = cur.fetchall()

    return [
        {
            "id": r[0],
            "filename": r[1],
            "original_filename": r[2],
            "user_id": r[3],
            "file_type": r[4],
            "file_size": r[5],
            "chunk_count": r[6],
            "is_shared": r[7],
            "shared_with_user_ids": r[8] or [],
            "created_at": r[9].isoformat() if r[9] else None,
            "owner_username": r[10] or "System",
            "owner_display_name": r[11] or "Workspace",
            "is_owner": (user_id is not None and r[3] == user_id),
        }
        for r in rows
    ]


def get_user_documents(user_id: int) -> list[dict]:
    """Retrieve documents specifically owned by a user."""
    with get_pool().connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    id, filename, original_filename, file_type,
                    file_size, chunk_count, is_shared, created_at
                FROM documents
                WHERE user_id = %s
                ORDER BY created_at DESC
                """,
                (user_id,),
            )
            rows = cur.fetchall()

    return [
        {
            "id": r[0],
            "filename": r[1],
            "original_filename": r[2],
            "file_type": r[3],
            "file_size": r[4],
            "chunk_count": r[5],
            "is_shared": r[6],
            "created_at": r[7].isoformat() if r[7] else None,
        }
        for r in rows
    ]


def can_user_access_document(filename: str, user: dict) -> bool:
    """Check if the given user has permission to read/query a document."""
    if not user:
        return False
    if user.get("role") == "Administrator":
        return True

    doc = get_document_record(filename)
    if not doc:
        return False

    user_id = user.get("id")
    if doc.get("user_id") == user_id:
        return True
    if doc.get("is_shared", False):
        return True
    if user_id in doc.get("shared_with_user_ids", []):
        return True

    return False


def update_document_sharing(
    filename: str,
    is_shared: bool,
    shared_with_user_ids: Optional[list[int]] = None,
) -> bool:
    """Toggle public workspace sharing or specific member permissions."""
    with get_pool().connection() as conn:
        with conn.cursor() as cur:
            if shared_with_user_ids is not None:
                cur.execute(
                    """
                    UPDATE documents
                    SET is_shared = %s, shared_with_user_ids = %s, updated_at = NOW()
                    WHERE filename = %s
                    """,
                    (is_shared, shared_with_user_ids, filename),
                )
            else:
                cur.execute(
                    """
                    UPDATE documents
                    SET is_shared = %s, updated_at = NOW()
                    WHERE filename = %s
                    """,
                    (is_shared, filename),
                )
            return cur.rowcount > 0


def delete_document_record(filename: str) -> bool:
    """Delete a document record from PostgreSQL."""
    with get_pool().connection() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM documents WHERE filename = %s", (filename,))
            return cur.rowcount > 0


# =========================================================
# KNOWLEDGE BASE (PERMANENT) QUERIES
# =========================================================

def list_knowledge_base_documents(
    search: Optional[str] = None,
    status_filter: Optional[str] = None,
    limit: int = 100,
    offset: int = 0,
) -> list[dict]:
    """
    List permanent company Knowledge Base documents.
    Excludes temporary chat documents.
    """
    conditions = ["d.is_temporary = FALSE"]
    params: list = []

    if status_filter and status_filter.upper() != "ALL":
        conditions.append("d.status = %s")
        params.append(status_filter)

    if search and search.strip():
        conditions.append("(d.original_filename ILIKE %s OR d.filename ILIKE %s)")
        term = f"%{search.strip()}%"
        params.extend([term, term])

    where_clause = " WHERE " + " AND ".join(conditions)
    params.extend([limit, offset])

    with get_pool().connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                SELECT
                    d.id, d.filename, d.original_filename, d.user_id,
                    d.file_type, d.file_size, d.chunk_count, d.is_shared,
                    d.status, d.last_indexed_at, d.access_scope, d.created_at,
                    u.username, u.display_name
                FROM documents d
                LEFT JOIN users u ON u.id = d.user_id
                {where_clause}
                ORDER BY d.created_at DESC
                LIMIT %s OFFSET %s
                """,
                tuple(params),
            )
            rows = cur.fetchall()

    return [
        {
            "id": r[0],
            "filename": r[1],
            "original_filename": r[2],
            "user_id": r[3],
            "file_type": r[4],
            "file_size": r[5],
            "chunk_count": r[6],
            "is_shared": r[7],
            "status": r[8] or "Indexed",
            "last_indexed_at": r[9].isoformat() if r[9] else None,
            "access_scope": r[10] or "Authorized company users",
            "created_at": r[11].isoformat() if r[11] else None,
            "uploaded_by_username": r[12] or "Administrator",
            "uploaded_by_name": r[13] or "Administrator",
        }
        for r in rows
    ]


def update_document_status(filename: str, status: str) -> bool:
    """Update status of a document (e.g. 'Indexed', 'Archived')."""
    with get_pool().connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE documents
                SET status = %s, updated_at = NOW()
                WHERE filename = %s
                """,
                (status, filename),
            )
            return cur.rowcount > 0


def update_document_last_indexed(filename: str, chunk_count: Optional[int] = None) -> bool:
    """Update last_indexed_at and chunk count for re-indexing."""
    with get_pool().connection() as conn:
        with conn.cursor() as cur:
            if chunk_count is not None:
                cur.execute(
                    """
                    UPDATE documents
                    SET last_indexed_at = NOW(), status = 'Indexed', chunk_count = %s, updated_at = NOW()
                    WHERE filename = %s
                    """,
                    (chunk_count, filename),
                )
            else:
                cur.execute(
                    """
                    UPDATE documents
                    SET last_indexed_at = NOW(), status = 'Indexed', updated_at = NOW()
                    WHERE filename = %s
                    """,
                    (filename,),
                )
            return cur.rowcount > 0


# =========================================================
# CHAT TEMPORARY DOCUMENTS (LIFECYCLE QUERIES)
# =========================================================

def list_temp_documents_for_conversation(conversation_id: int) -> list[dict]:
    """Retrieve temporary documents attached to a specific conversation."""
    with get_pool().connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, filename, original_filename, user_id, file_size, chunk_count, created_at
                FROM documents
                WHERE is_temporary = TRUE AND conversation_id = %s
                ORDER BY created_at ASC
                """,
                (conversation_id,),
            )
            rows = cur.fetchall()

    return [
        {
            "id": r[0],
            "filename": r[1],
            "original_filename": r[2],
            "user_id": r[3],
            "file_size": r[4],
            "chunk_count": r[5],
            "created_at": r[6].isoformat() if r[6] else None,
        }
        for r in rows
    ]


def delete_temp_documents_for_conversation(conversation_id: int) -> list[str]:
    """Delete all temporary documents for a conversation from PostgreSQL and return filenames."""
    with get_pool().connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT filename FROM documents
                WHERE is_temporary = TRUE AND conversation_id = %s
                """,
                (conversation_id,),
            )
            filenames = [r[0] for r in cur.fetchall()]

            if filenames:
                cur.execute(
                    """
                    DELETE FROM documents
                    WHERE is_temporary = TRUE AND conversation_id = %s
                    """,
                    (conversation_id,),
                )
            return filenames


def cleanup_abandoned_temp_records(max_age_hours: int = 24) -> list[dict]:
    """
    Find and delete abandoned temporary records:
    1. Temp records whose parent conversation has been deleted.
    2. Temp records older than max_age_hours without active conversation.
    """
    with get_pool().connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT d.id, d.filename, d.conversation_id
                FROM documents d
                LEFT JOIN conversations c ON c.id = d.conversation_id
                WHERE d.is_temporary = TRUE
                  AND (c.id IS NULL OR d.created_at < NOW() - (%s || ' hours')::INTERVAL)
                """,
                (str(max_age_hours),),
            )
            rows = cur.fetchall()
            abandoned = [{"id": r[0], "filename": r[1], "conversation_id": r[2]} for r in rows]

            if abandoned:
                ids = [a["id"] for a in abandoned]
                cur.execute("DELETE FROM documents WHERE id = ANY(%s)", (ids,))

            return abandoned
