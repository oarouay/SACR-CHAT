from datetime import datetime, timedelta, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import cast, case, Date, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_password_hash
from app.dependencies.auth import get_current_active_admin, get_current_user
from app.dependencies.tenant import get_current_tenant
from app.models.tenant import Tenant
from app.models.usage import UsageEvent
from app.models.user import User
from app.schemas.analytics import AnalyticsPeriod, DailyAnalytics, TenantAnalyticsResponse
from app.schemas.tenant import TenantResponse, TenantUpdate
from app.schemas.user import UserCreate, UserResponse

router = APIRouter(prefix="/tenants", tags=["Tenant Administration"])


@router.get(
    "/current",
    response_model=TenantResponse,
    summary="Get current active Tenant details"
)
async def get_current_tenant_details(
    tenant: Tenant = Depends(get_current_tenant)
):
    """Retrieve details about the tenant organization of the current authenticated user."""
    return tenant


@router.patch(
    "/current",
    response_model=TenantResponse,
    summary="Update current Tenant metadata (Admin only)"
)
async def update_current_tenant_details(
    payload: TenantUpdate,
    tenant: Tenant = Depends(get_current_tenant),
    admin: User = Depends(get_current_active_admin),
    db: AsyncSession = Depends(get_db)
):
    """Allows tenant administrators to update their organization profile."""
    if payload.name is not None:
        tenant.name = payload.name
    if payload.description is not None:
        tenant.description = payload.description
        
    db.add(tenant)
    await db.flush()
    return tenant


@router.get(
    "/users",
    response_model=List[UserResponse],
    summary="List all users within the current Tenant"
)
async def list_tenant_users(
    tenant: Tenant = Depends(get_current_tenant),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Lists all team members belonging exclusively to the current tenant."""
    stmt = select(User).where(User.tenant_id == tenant.id)
    result = await db.execute(stmt)
    return result.scalars().all()


@router.post(
    "/users",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Add a new user to the current Tenant (Admin only)"
)
async def create_tenant_user(
    payload: UserCreate,
    tenant: Tenant = Depends(get_current_tenant),
    admin: User = Depends(get_current_active_admin),
    db: AsyncSession = Depends(get_db)
):
    """Create and invite a new user under the current tenant's isolation scope."""
    # Check if email is already taken
    stmt = select(User).where(User.email == payload.email.lower())
    res = await db.execute(stmt)
    if res.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"User with email '{payload.email}' already exists."
        )

    new_user = User(
        email=payload.email.lower(),
        hashed_password=get_password_hash(payload.password),
        full_name=payload.full_name,
        role=payload.role if payload.role in ["admin", "member"] else "member",
        is_active=True,
        is_superuser=False,
        tenant_id=tenant.id
    )
    db.add(new_user)
    await db.flush()
    return new_user


@router.get(
    "/analytics",
    response_model=TenantAnalyticsResponse,
    summary="Get aggregated telemetry and usage analytics for the current tenant",
)
async def get_tenant_analytics(
    from_date: Optional[str] = Query(None, alias="from", description="ISO start date e.g. YYYY-MM-DD"),
    to_date: Optional[str] = Query(None, alias="to", description="ISO end date e.g. YYYY-MM-DD"),
    tenant: Tenant = Depends(get_current_tenant),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Returns high-level API request counts, token consumption, latency, and daily time-series
    usage records strictly isolated to the authenticated tenant.
    """
    now = datetime.now(timezone.utc)
    from_dt: Optional[datetime] = None
    to_dt: Optional[datetime] = None

    if from_date:
        try:
            parsed = datetime.fromisoformat(from_date)
            from_dt = parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
        except Exception:
            pass
    if not from_dt:
        from_dt = now - timedelta(days=30)

    if to_date:
        try:
            parsed = datetime.fromisoformat(to_date)
            to_dt = parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
            to_dt = to_dt.replace(hour=23, minute=59, second=59)
        except Exception:
            pass
    if not to_dt:
        to_dt = now

    base_filter = [
        UsageEvent.tenant_id == tenant.id,
        UsageEvent.created_at >= from_dt,
        UsageEvent.created_at <= to_dt,
    ]

    # Aggregate metric summary
    summary_stmt = select(
        func.count(
            case((UsageEvent.event_type.in_(["chat", "chat_stream"]), 1), else_=None)
        ).label("messages"),
        func.count(UsageEvent.id).label("api_requests"),
        func.count(func.distinct(UsageEvent.user_id)).label("active_users"),
        func.coalesce(func.sum(UsageEvent.input_tokens), 0).label("input_tokens"),
        func.coalesce(func.sum(UsageEvent.output_tokens), 0).label("output_tokens"),
        func.coalesce(func.sum(UsageEvent.total_tokens), 0).label("total_tokens"),
        func.coalesce(func.avg(UsageEvent.latency_ms), 0.0).label("avg_latency_ms"),
        func.count(case((UsageEvent.status_code >= 400, 1), else_=None)).label("error_count"),
    ).where(*base_filter)

    summary_res = await db.execute(summary_stmt)
    summary = summary_res.one()

    # Daily time-series breakdown
    from sqlalchemy import String
    date_col = func.substr(cast(UsageEvent.created_at, String), 1, 10).label("event_date")
    daily_stmt = (
        select(
            date_col,
            func.count(
                case((UsageEvent.event_type.in_(["chat", "chat_stream"]), 1), else_=None)
            ).label("messages"),
            func.count(UsageEvent.id).label("api_requests"),
            func.coalesce(func.sum(UsageEvent.total_tokens), 0).label("tokens"),
        )
        .where(*base_filter)
        .group_by(date_col)
        .order_by(date_col.asc())
    )
    daily_res = await db.execute(daily_stmt)
    daily_rows = daily_res.all()

    daily_list = [
        DailyAnalytics(
            date=str(r.event_date),
            messages=r.messages,
            api_requests=r.api_requests,
            tokens=int(r.tokens),
        )
        for r in daily_rows
    ]

    return TenantAnalyticsResponse(
        period=AnalyticsPeriod(
            from_date=from_dt.strftime("%Y-%m-%d"),
            to_date=to_dt.strftime("%Y-%m-%d"),
        ),
        messages=summary.messages or 0,
        api_requests=summary.api_requests or 0,
        active_users=summary.active_users or 0,
        input_tokens=int(summary.input_tokens or 0),
        output_tokens=int(summary.output_tokens or 0),
        total_tokens=int(summary.total_tokens or 0),
        avg_latency_ms=round(float(summary.avg_latency_ms or 0.0), 2),
        error_count=summary.error_count or 0,
        daily=daily_list,
    )
