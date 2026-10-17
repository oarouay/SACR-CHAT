import logging
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.usage import UsageEvent

logger = logging.getLogger(__name__)


async def record_usage_event(
    db: AsyncSession,
    tenant_id: int,
    request_id: str,
    endpoint: str,
    http_method: str,
    status_code: int,
    latency_ms: float,
    auth_type: str = "jwt",
    user_id: Optional[int] = None,
    api_key_id: Optional[int] = None,
    event_type: str = "api_request",
    provider: Optional[str] = None,
    model: Optional[str] = None,
    input_tokens: Optional[int] = None,
    output_tokens: Optional[int] = None,
    total_tokens: Optional[int] = None,
    source_count: Optional[int] = None,
    conversation_id: Optional[int] = None,
) -> Optional[UsageEvent]:
    """
    Safely persist an immutable usage & telemetry event.
    
    Security & Privacy Guarantee:
    Never persists prompts, completions, tokens, JWTs, or API secrets.
    Does not crash or abort the parent request if persistence fails.
    """
    if total_tokens is None and (input_tokens is not None or output_tokens is not None):
        total_tokens = (input_tokens or 0) + (output_tokens or 0)

    try:
        event = UsageEvent(
            tenant_id=tenant_id,
            user_id=user_id,
            api_key_id=api_key_id,
            auth_type=auth_type,
            request_id=request_id,
            event_type=event_type,
            endpoint=endpoint,
            http_method=http_method,
            status_code=status_code,
            latency_ms=round(latency_ms, 2),
            provider=provider,
            model=model,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            total_tokens=total_tokens,
            source_count=source_count,
            conversation_id=conversation_id,
        )
        db.add(event)
        await db.commit()
        await db.refresh(event)
        return event
    except Exception as exc:
        logger.error(f"Failed to record usage event for tenant {tenant_id}: {exc}", exc_info=True)
        try:
            await db.rollback()
        except Exception:
            pass
        return None
