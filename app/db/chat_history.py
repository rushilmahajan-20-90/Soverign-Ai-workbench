
import logging
from typing import Optional

from app.db.database import get_pool

logger = logging.getLogger(__name__)


def create_conversation(title: str = "New conversation", user_id: int = None, project_id: Optional[str] = None) -> dict:
    """Create a conversation and return its ID, project scope and timestamps."""
    title = title.strip() or "New conversation"

    with get_pool().connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO conversations (title, user_id, project_id)
                VALUES (%s, %s, %s)
                RETURNING id, title, user_id, project_id, created_at, updated_at
                """,
                (title[:255], user_id, project_id),
            )
            row = cur.fetchone()

    return {
        "id": row[0],
        "title": row[1],
        "user_id": row[2],
        "project_id": row[3],
        "created_at": row[4],
        "updated_at": row[5],
    }


def list_conversations(
    limit: int = 50,
    offset: int = 0,
    user_id: int = None,
    project_id: Optional[str] = None,
    exclude_projects: bool = False,
) -> list[dict]:
    """List conversations, newest activity first, with optional project isolation."""
    limit = max(1, min(limit, 100))
    offset = max(0, offset)

    where_clauses = []
    params = []

    if user_id is not None:
        where_clauses.append("c.user_id = %s")
        params.append(user_id)

    if project_id is not None:
        where_clauses.append("c.project_id = %s")
        params.append(project_id)
    elif exclude_projects:
        where_clauses.append("c.project_id IS NULL")

    where_sql = f"WHERE {' AND '.join(where_clauses)}" if where_clauses else ""

    query = f"""
        SELECT
            c.id,
            c.title,
            c.user_id,
            c.project_id,
            c.created_at,
            c.updated_at,
            COUNT(m.id) AS message_count
        FROM conversations AS c
        LEFT JOIN messages AS m
            ON m.conversation_id = c.id
        {where_sql}
        GROUP BY c.id
        ORDER BY c.updated_at DESC, c.id DESC
        LIMIT %s OFFSET %s
    """
    params.extend([limit, offset])

    with get_pool().connection() as conn:
        with conn.cursor() as cur:
            cur.execute(query, tuple(params))
            rows = cur.fetchall()

    return [
        {
            "id": row[0],
            "title": row[1],
            "user_id": row[2],
            "project_id": row[3],
            "created_at": row[4],
            "updated_at": row[5],
            "message_count": row[6],
        }
        for row in rows
    ]


def get_conversation(conversation_id: int) -> Optional[dict]:
    """Get a conversation and its messages."""
    with get_pool().connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, title, user_id, project_id, created_at, updated_at
                FROM conversations
                WHERE id = %s
                """,
                (conversation_id,),
            )
            row = cur.fetchone()

            if row is None:
                return None

            conversation = {
                "id": row[0],
                "title": row[1],
                "user_id": row[2],
                "project_id": row[3],
                "created_at": row[4],
                "updated_at": row[5],
            }

            cur.execute(
                """
                SELECT id, role, content, created_at
                FROM messages
                WHERE conversation_id = %s
                ORDER BY created_at ASC, id ASC
                """,
                (conversation_id,),
            )
            messages = cur.fetchall()

    conversation["messages"] = [
        {
            "id": message[0],
            "role": message[1],
            "content": message[2],
            "created_at": message[3],
        }
        for message in messages
    ]

    return conversation


def add_message(
    conversation_id: int,
    role: str,
    content: str,
) -> dict:
    """Persist one message and update conversation activity."""
    if role not in {"user", "assistant", "system", "tool"}:
        raise ValueError("Unsupported message role.")

    with get_pool().connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO messages (conversation_id, role, content)
                VALUES (%s, %s, %s)
                RETURNING id, conversation_id, role, content, created_at
                """,
                (conversation_id, role, content),
            )
            row = cur.fetchone()

            cur.execute(
                """
                UPDATE conversations
                SET updated_at = NOW()
                WHERE id = %s
                """,
                (conversation_id,),
            )

    return {
        "id": row[0],
        "conversation_id": row[1],
        "role": row[2],
        "content": row[3],
        "created_at": row[4],
    }


def delete_conversation(conversation_id: int) -> bool:
    """Delete a conversation; its messages cascade-delete."""
    with get_pool().connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "DELETE FROM conversations WHERE id = %s",
                (conversation_id,),
            )
            deleted = cur.rowcount > 0

    return deleted


def update_conversation_title(
    conversation_id: int,
    title: str,
) -> bool:
    """Rename an existing conversation."""
    title = title.strip()

    if not title:
        raise ValueError("Conversation title cannot be empty.")

    with get_pool().connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE conversations
                SET title = %s, updated_at = NOW()
                WHERE id = %s
                """,
                (title[:255], conversation_id),
            )
            updated = cur.rowcount > 0

    return updated
