from datetime import datetime, timezone
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import case, cast, Date, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.dependencies.auth import get_current_active_admin
from app.models.ai_profile import Persona
from app.models.api_key import TenantApiKey
from app.models.usage import UsageEvent
from app.models.user import User
from app.schemas.api_key import (
    ApiKeyCreate,
    ApiKeyCreatedResponse,
    ApiKeyResponse,
    ApiKeyUsageDaily,
    ApiKeyUsageResponse,
    VALID_SCOPES,
)
from app.services.api_key_service import generate_api_key, mask_api_key

router = APIRouter(prefix="/api-keys", tags=["Developer API Keys"])


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _serialize_key(key_record: TenantApiKey) -> ApiKeyResponse:
    persona_name = key_record.persona.name if getattr(key_record, "persona", None) else None
    return ApiKeyResponse(
        id=key_record.id,
        name=key_record.name,
        key_prefix=key_record.key_prefix,
        masked_key=mask_api_key(key_record.key_prefix),
        scopes=key_record.scopes,
        is_active=key_record.is_active,
        created_at=key_record.created_at,
        expires_at=key_record.expires_at,
        last_used_at=key_record.last_used_at,
        revoked_at=key_record.revoked_at,
        persona_id=key_record.persona_id,
        persona_name=persona_name,
    )


@router.post(
    "/",
    response_model=ApiKeyCreatedResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new Developer API Key",
)
async def create_api_key(
    payload: ApiKeyCreate,
    current_user: User = Depends(get_current_active_admin),
    db: AsyncSession = Depends(get_db),
):
    """
    Generate a new Developer API Key for programmatic tenant access.
    
    IMPORTANT:
    The full secret key is returned EXACTLY ONCE in this response.
    It is never stored in plaintext and cannot be retrieved again.
    """
    # Validate scopes
    scopes = payload.scopes or list(VALID_SCOPES)
    for sc in scopes:
        if sc not in VALID_SCOPES:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid scope '{sc}'. Allowed scopes are: {VALID_SCOPES}",
            )

    bound_persona = None
    if payload.persona_id is not None:
        p_stmt = select(Persona).where(
            Persona.id == payload.persona_id,
            Persona.tenant_id == current_user.tenant_id,
        )
        p_res = await db.execute(p_stmt)
        bound_persona = p_res.scalar_one_or_none()
        if not bound_persona:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Persona with ID {payload.persona_id} not found in your organization",
            )

    full_key, key_prefix, key_hash = generate_api_key()

    new_key = TenantApiKey(
        tenant_id=current_user.tenant_id,
        name=payload.name,
        key_prefix=key_prefix,
        key_hash=key_hash,
        scopes=scopes,
        is_active=True,
        expires_at=payload.expires_at,
        created_by_user_id=current_user.id,
        persona_id=payload.persona_id,
    )
    db.add(new_key)
    await db.commit()
    await db.refresh(new_key)

    return ApiKeyCreatedResponse(
        id=new_key.id,
        name=new_key.name,
        key_prefix=new_key.key_prefix,
        masked_key=mask_api_key(new_key.key_prefix),
        key=full_key,
        scopes=new_key.scopes,
        is_active=new_key.is_active,
        created_at=new_key.created_at,
        expires_at=new_key.expires_at,
        last_used_at=new_key.last_used_at,
        revoked_at=new_key.revoked_at,
        persona_id=new_key.persona_id,
        persona_name=bound_persona.name if bound_persona else None,
    )


@router.get(
    "/",
    response_model=List[ApiKeyResponse],
    summary="List all Developer API Keys for current tenant",
)
async def list_api_keys(
    current_user: User = Depends(get_current_active_admin),
    db: AsyncSession = Depends(get_db),
):
    """
    List metadata for all API keys belonging strictly to the authenticated tenant.
    Plaintext secrets are never returned.
    """
    stmt = (
        select(TenantApiKey)
        .options(selectinload(TenantApiKey.persona))
        .where(TenantApiKey.tenant_id == current_user.tenant_id)
        .order_by(TenantApiKey.created_at.desc())
    )
    result = await db.execute(stmt)
    keys = result.scalars().all()
    return [_serialize_key(k) for k in keys]


@router.delete(
    "/{key_id}",
    response_model=ApiKeyResponse,
    summary="Revoke an API Key",
)
@router.post(
    "/{key_id}/revoke",
    response_model=ApiKeyResponse,
    summary="Revoke an API Key (alternative endpoint)",
)
async def revoke_api_key(
    key_id: int,
    current_user: User = Depends(get_current_active_admin),
    db: AsyncSession = Depends(get_db),
):
    """
    Soft-revoke a Developer API Key immediately.
    The key is permanently deactivated and all future authentication attempts will fail.
    Audit history and usage data are retained.
    """
    stmt = (
        select(TenantApiKey)
        .options(selectinload(TenantApiKey.persona))
        .where(
            TenantApiKey.id == key_id,
            TenantApiKey.tenant_id == current_user.tenant_id,
        )
    )
    result = await db.execute(stmt)
    key_record = result.scalar_one_or_none()

    if not key_record:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="API Key not found",
        )

    key_record.is_active = False
    key_record.revoked_at = utc_now()
    await db.commit()
    await db.refresh(key_record)

    return _serialize_key(key_record)


@router.post(
    "/{key_id}/rotate",
    response_model=ApiKeyCreatedResponse,
    summary="Rotate an API Key",
)
async def rotate_api_key(
    key_id: int,
    current_user: User = Depends(get_current_active_admin),
    db: AsyncSession = Depends(get_db),
):
    """
    Rotate an API Key:
    1. Immediately revokes the existing key.
    2. Generates and activates a new successor key with identical scopes, name, and persona binding.
    3. Returns the new secret key once.
    """
    stmt = (
        select(TenantApiKey)
        .options(selectinload(TenantApiKey.persona))
        .where(
            TenantApiKey.id == key_id,
            TenantApiKey.tenant_id == current_user.tenant_id,
        )
    )
    result = await db.execute(stmt)
    old_key = result.scalar_one_or_none()

    if not old_key:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="API Key not found",
        )

    now = utc_now()
    old_key.is_active = False
    old_key.revoked_at = now

    full_key, key_prefix, key_hash = generate_api_key()
    new_key = TenantApiKey(
        tenant_id=current_user.tenant_id,
        name=old_key.name,
        key_prefix=key_prefix,
        key_hash=key_hash,
        scopes=old_key.scopes,
        is_active=True,
        expires_at=old_key.expires_at,
        created_by_user_id=current_user.id,
        persona_id=old_key.persona_id,
    )

    db.add(new_key)
    await db.commit()
    await db.refresh(new_key)

    return ApiKeyCreatedResponse(
        id=new_key.id,
        name=new_key.name,
        key_prefix=new_key.key_prefix,
        masked_key=mask_api_key(new_key.key_prefix),
        key=full_key,
        scopes=new_key.scopes,
        is_active=new_key.is_active,
        created_at=new_key.created_at,
        expires_at=new_key.expires_at,
        last_used_at=new_key.last_used_at,
        revoked_at=new_key.revoked_at,
        persona_id=new_key.persona_id,
        persona_name=old_key.persona.name if old_key.persona else None,
    )


@router.get(
    "/{key_id}/usage",
    response_model=ApiKeyUsageResponse,
    summary="Get usage analytics for a specific API Key",
)
async def get_api_key_usage(
    key_id: int,
    current_user: User = Depends(get_current_active_admin),
    db: AsyncSession = Depends(get_db),
):
    """
    Get aggregated usage metrics for a specific API Key.
    Strictly scoped to the tenant.
    """
    stmt = (
        select(TenantApiKey)
        .where(
            TenantApiKey.id == key_id,
            TenantApiKey.tenant_id == current_user.tenant_id,
        )
    )
    result = await db.execute(stmt)
    key_record = result.scalar_one_or_none()

    if not key_record:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="API Key not found",
        )

    # Aggregated totals
    summary_stmt = (
        select(
            func.count(UsageEvent.id).label("total_requests"),
            func.coalesce(func.sum(UsageEvent.total_tokens), 0).label("total_tokens"),
            func.coalesce(
                func.sum(
                    case((UsageEvent.status_code >= 400, 1), else_=0)
                ),
                0,
            ).label("error_count"),
        )
        .where(
            UsageEvent.tenant_id == current_user.tenant_id,
            UsageEvent.api_key_id == key_id,
        )
    )
    summary_res = await db.execute(summary_stmt)
    summary = summary_res.one()

    # Daily breakdown (last 30 days)
    from sqlalchemy import String
    date_col = func.substr(cast(UsageEvent.created_at, String), 1, 10).label("event_date")
    daily_stmt = (
        select(
            date_col,
            func.count(UsageEvent.id).label("requests"),
            func.coalesce(func.sum(UsageEvent.total_tokens), 0).label("tokens"),
        )
        .where(
            UsageEvent.tenant_id == current_user.tenant_id,
            UsageEvent.api_key_id == key_id,
        )
        .group_by(date_col)
        .order_by(date_col.desc())
        .limit(30)
    )
    daily_res = await db.execute(daily_stmt)
    daily_rows = daily_res.all()

    daily_list = [
        ApiKeyUsageDaily(
            date=str(row.event_date),
            requests=row.requests,
            tokens=int(row.tokens),
        )
        for row in daily_rows
    ]

    return ApiKeyUsageResponse(
        id=key_record.id,
        name=key_record.name,
        masked_key=mask_api_key(key_record.key_prefix),
        total_requests=summary.total_requests or 0,
        total_tokens=int(summary.total_tokens or 0),
        error_count=int(summary.error_count or 0),
        last_used_at=key_record.last_used_at,
        daily=daily_list,
    )
