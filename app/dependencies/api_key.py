from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import Depends, HTTPException, Request, Security, status
from fastapi.security import APIKeyHeader
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.models.api_key import TenantApiKey
from app.models.tenant import Tenant
from app.models.user import User
from app.services.api_key_service import hash_api_key, KEY_PREFIX_BASE

api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False, description="OmniGraph Developer API Key")


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


@dataclass
class RequestPrincipal:
    """
    Unified security principal representing either a JWT-authenticated user session
    or a programmatic Developer API Key request.
    Strictly encapsulates tenant context and permissions.
    """
    tenant_id: int
    tenant: Tenant
    user_id: Optional[int] = None
    user: Optional[User] = None
    api_key_id: Optional[int] = None
    api_key: Optional[TenantApiKey] = None
    auth_type: str = "jwt"  # "jwt" | "api_key"
    scopes: List[str] = field(default_factory=lambda: ["*"])
    persona_id: Optional[int] = None

    @property
    def is_api_key(self) -> bool:
        return self.auth_type == "api_key"

    @property
    def is_jwt(self) -> bool:
        return self.auth_type == "jwt"


async def get_api_key_principal(
    api_key_raw: Optional[str] = Security(api_key_header),
    db: AsyncSession = Depends(get_db),
) -> TenantApiKey:
    """
    Validate X-API-Key header and return the active TenantApiKey model.
    Checks prefix, computes HMAC hash, verifies active status, expiration, and revocation.
    Updates last_used_at on successful verification.
    """
    if not api_key_raw:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing X-API-Key header",
            headers={"WWW-Authenticate": "ApiKey"},
        )

    if not api_key_raw.startswith(KEY_PREFIX_BASE):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid API key format",
            headers={"WWW-Authenticate": "ApiKey"},
        )

    # Compute HMAC-SHA256 digest
    computed_hash = hash_api_key(api_key_raw)

    stmt = (
        select(TenantApiKey)
        .options(selectinload(TenantApiKey.tenant))
        .where(TenantApiKey.key_hash == computed_hash)
    )
    result = await db.execute(stmt)
    api_key_record = result.scalar_one_or_none()

    if api_key_record is None or not api_key_record.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or deactivated API key",
            headers={"WWW-Authenticate": "ApiKey"},
        )

    if api_key_record.revoked_at is not None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="API key has been revoked",
            headers={"WWW-Authenticate": "ApiKey"},
        )

    now = utc_now()
    if api_key_record.expires_at is not None and api_key_record.expires_at < now:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="API key has expired",
            headers={"WWW-Authenticate": "ApiKey"},
        )

    if not api_key_record.tenant or not api_key_record.tenant.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Tenant organization is deactivated",
        )

    # Update last_used_at timestamp
    api_key_record.last_used_at = now
    try:
        await db.commit()
    except Exception:
        await db.rollback()

    return api_key_record


async def get_request_principal(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> RequestPrincipal:
    """
    Unified authentication dependency supporting either:
    1. X-API-Key header (Developer API keys for programmatic access)
    2. Authorization: Bearer <JWT> (User dashboard sessions)

    Returns a RequestPrincipal with tenant and actor context.
    """
    # 1. Check for X-API-Key header
    api_key_raw = request.headers.get("X-API-Key")
    if api_key_raw:
        if not api_key_raw.startswith(KEY_PREFIX_BASE):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid API key format",
                headers={"WWW-Authenticate": "ApiKey"},
            )

        computed_hash = hash_api_key(api_key_raw)
        stmt = (
            select(TenantApiKey)
            .options(selectinload(TenantApiKey.tenant))
            .where(TenantApiKey.key_hash == computed_hash)
        )
        result = await db.execute(stmt)
        api_key_record = result.scalar_one_or_none()

        if api_key_record is None or not api_key_record.is_active:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or deactivated API key",
                headers={"WWW-Authenticate": "ApiKey"},
            )

        if api_key_record.revoked_at is not None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="API key has been revoked",
                headers={"WWW-Authenticate": "ApiKey"},
            )

        now = utc_now()
        if api_key_record.expires_at is not None and api_key_record.expires_at < now:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="API key has expired",
                headers={"WWW-Authenticate": "ApiKey"},
            )

        if not api_key_record.tenant or not api_key_record.tenant.is_active:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Tenant organization is deactivated",
            )

        # Update last_used_at timestamp
        api_key_record.last_used_at = now
        try:
            await db.commit()
        except Exception:
            await db.rollback()

        return RequestPrincipal(
            tenant_id=api_key_record.tenant_id,
            tenant=api_key_record.tenant,
            api_key_id=api_key_record.id,
            api_key=api_key_record,
            auth_type="api_key",
            scopes=api_key_record.scopes or [],
            persona_id=api_key_record.persona_id,
        )

    # 2. Check for Bearer JWT token
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.lower().startswith("bearer "):
        token = auth_header[7:].strip()
        credentials_exception = HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
        try:
            import jwt
            from app.core.config import settings
            payload = jwt.decode(
                token,
                settings.SECRET_KEY,
                algorithms=[settings.ALGORITHM]
            )
            user_id_str = payload.get("sub")
            tenant_id_str = payload.get("tenant_id")
            if not user_id_str or not tenant_id_str:
                raise credentials_exception
            user_id = int(user_id_str)
        except Exception:
            raise credentials_exception

        stmt = (
            select(User)
            .options(selectinload(User.tenant))
            .where(User.id == user_id)
        )
        res = await db.execute(stmt)
        user = res.scalar_one_or_none()

        if user is None or not user.is_active:
            raise credentials_exception

        if str(user.tenant_id) != str(tenant_id_str):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token tenant association is invalid or expired",
            )

        if not user.tenant or not user.tenant.is_active:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Tenant organization is deactivated",
            )

        return RequestPrincipal(
            tenant_id=user.tenant_id,
            tenant=user.tenant,
            user_id=user.id,
            user=user,
            auth_type="jwt",
            scopes=["*"],
        )

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Authentication required. Provide Authorization: Bearer <token> or X-API-Key: ogr_live_...",
        headers={"WWW-Authenticate": "Bearer, ApiKey"},
    )


async def get_current_tenant_or_api_key(
    principal: RequestPrincipal = Depends(get_request_principal),
) -> Tenant:
    """Dependency returning the validated Tenant from either JWT or API Key."""
    return principal.tenant


def require_scope(required_scope: str):
    """Dependency factory checking that the principal has the necessary scope."""
    async def _scope_checker(
        principal: RequestPrincipal = Depends(get_request_principal)
    ) -> RequestPrincipal:
        if principal.is_api_key:
            if required_scope not in principal.scopes and "*" not in principal.scopes:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"API key does not have required scope: '{required_scope}'",
                )
        return principal
    return _scope_checker
