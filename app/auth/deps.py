import logging
from typing import Optional

from fastapi import Depends, Header, HTTPException, Request, status

from app.auth.security import decode_access_token
from app.db.users import get_user

logger = logging.getLogger(__name__)


def get_client_ip(request: Request) -> str:
    """Extract client IP address for audit logging."""
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    if request.client and request.client.host:
        return request.client.host
    return "127.0.0.1"


async def get_current_user(
    request: Request,
    authorization: Optional[str] = Header(None, alias="Authorization"),
    x_auth_token: Optional[str] = Header(None, alias="X-Auth-Token"),
) -> dict:
    """
    Authenticate request via JWT bearer token.
    Enforces that user exists and is active.
    """
    raw_token = None
    if authorization:
        parts = authorization.split()
        if len(parts) == 2 and parts[0].lower() == "bearer":
            raw_token = parts[1]
        elif len(parts) == 1:
            raw_token = parts[0]
    elif x_auth_token:
        raw_token = x_auth_token
    else:
        # Check query parameter as fallback for downloads/previews
        raw_token = request.query_params.get("token")

    if not raw_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication token required. Please log in.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    payload = decode_access_token(raw_token)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session has expired or is invalid. Please log in again.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user_id = payload.get("user_id") or payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token claims.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        user_id_int = int(user_id)
    except (ValueError, TypeError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Malformed user identity in token.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user = get_user(user_id_int)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User account no longer exists.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.get("is_active", True):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This account has been deactivated by an Administrator.",
        )

    return user


async def get_optional_user(
    request: Request,
    authorization: Optional[str] = Header(None, alias="Authorization"),
    x_auth_token: Optional[str] = Header(None, alias="X-Auth-Token"),
) -> Optional[dict]:
    """Optional authentication for public or semi-public views."""
    try:
        return await get_current_user(request, authorization, x_auth_token)
    except HTTPException:
        return None


async def require_admin(
    user: dict = Depends(get_current_user),
) -> dict:
    """
    Enforce Administrator role.
    Rejects normal Members with 403 Forbidden.
    """
    if user.get("role") != "Administrator":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Administrative privileges required. Access denied.",
        )
    return user
