"""Dependency injection and common endpoint dependencies."""

import os
import uuid
from typing import Annotated, Optional, Sequence

import redis.asyncio as redis
from celery import Celery
from fastapi import Depends, HTTPException, Request, status

from app.core.providers.factory import create_provider
from app.settings import settings
from app.utils.logging import get_logger

logger = get_logger(__name__)

# Global instances (initialized in lifespan)
redis_client: Optional[redis.Redis] = None
celery_app: Optional[Celery] = None


async def get_redis() -> redis.Redis:
    """Get Redis client."""
    if not redis_client:
        raise RuntimeError("Redis client not initialized")
    return redis_client


async def get_celery() -> Celery:
    """Get Celery app."""
    if not celery_app:
        raise RuntimeError("Celery app not initialized")
    return celery_app


async def get_request_id(
    request: Request,
) -> str:
    """Get or generate request ID."""
    # Check if already set in request state
    if hasattr(request.state, "request_id"):
        return request.state.request_id

    # Generate new ID
    request_id = f"req_{uuid.uuid4().hex[:12]}"
    request.state.request_id = request_id
    return request_id


async def get_provider(
    provider_name: Optional[str] = None,
):
    """
    Get LLM provider instance.

    Args:
        provider_name: Optional provider override

    Returns:
        Provider instance
    """
    try:
        return create_provider(provider_name=provider_name)
    except Exception as e:
        logger.error(f"Failed to create provider: {e}")
        raise


# ---------------------------------------------------------------------------
# Authentication helpers

VALID_API_KEYS: Sequence[str] = [
    key.strip() for key in os.getenv("API_KEYS", "test-key").split(",") if key.strip()
]


async def verify_api_key(request: Request) -> str:
    """Validate the ``X-API-Key`` header.

    Raises ``HTTPException`` if the header is missing or invalid. Returns the
    API key value for downstream dependencies.
    """

    api_key = request.headers.get("X-API-Key")
    if not api_key:
        if settings.debug:
            return "debug"
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing API key")

    if api_key not in VALID_API_KEYS:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid API key")

    return api_key


async def get_current_user_from_api_key(
    api_key: Annotated[str, Depends(verify_api_key)],
) -> dict:
    """Return a mock user object based on the API key."""

    return {"id": api_key, "name": "api_user"}


async def rate_limiter_standard(
    request: Request,
    redis_client: Annotated[redis.Redis, Depends(get_redis)],
    limit: int = int(os.getenv("RATE_LIMIT_STANDARD", "60")),
) -> None:
    """Basic token bucket rate limiter with Redis backend."""

    api_key = request.headers.get("X-API-Key", "anonymous")
    key = f"rl:{api_key}"

    count = await redis_client.incr(key)
    if count == 1:
        # First hit - set expiry
        await redis_client.expire(key, 60)

    if count > limit:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="Rate limit exceeded"
        )
