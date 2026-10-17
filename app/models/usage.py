from typing import TYPE_CHECKING, Optional
from sqlalchemy import Float, ForeignKey, Index, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import TenantMixin

if TYPE_CHECKING:
    from app.models.tenant import Tenant
    from app.models.user import User
    from app.models.api_key import TenantApiKey


class UsageEvent(Base, TenantMixin):
    """
    Immutable audit & telemetry usage records for API observability, quotas, and analytics.
    Every event is strictly scoped to a tenant.
    Sensitive payload data (passwords, tokens, prompts, secrets) are NEVER stored here.
    """
    __tablename__ = "usage_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True, autoincrement=True)
    
    # User or programmatic API key attribution
    user_id: Mapped[Optional[int]] = mapped_column(
        Integer,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True
    )
    api_key_id: Mapped[Optional[int]] = mapped_column(
        Integer,
        ForeignKey("tenant_api_keys.id", ondelete="SET NULL"),
        nullable=True,
        index=True
    )
    auth_type: Mapped[str] = mapped_column(String(32), default="jwt", nullable=False)  # "jwt", "api_key", "widget", "public"
    
    # Request telemetry & correlation
    request_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    event_type: Mapped[str] = mapped_column(String(64), nullable=False, index=True)  # "chat", "chat_stream", "api_request", "source_ingest"
    endpoint: Mapped[str] = mapped_column(String(255), nullable=False)
    http_method: Mapped[str] = mapped_column(String(10), nullable=False)
    status_code: Mapped[int] = mapped_column(Integer, nullable=False)
    latency_ms: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    
    # LLM / GraphRAG execution metrics (null if non-AI request or provider doesn't report)
    provider: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)  # "openai", "gemini"
    model: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    input_tokens: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    output_tokens: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    total_tokens: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    
    # Retrieval metrics
    source_count: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    conversation_id: Mapped[Optional[int]] = mapped_column(
        Integer,
        ForeignKey("conversations.id", ondelete="SET NULL"),
        nullable=True,
        index=True
    )

    # Composite indexes for fast analytics queries
    __table_args__ = (
        Index("ix_usage_events_tenant_created", "tenant_id", "created_at"),
        Index("ix_usage_events_tenant_event_created", "tenant_id", "event_type", "created_at"),
        Index("ix_usage_events_api_key_created", "api_key_id", "created_at"),
    )

    # Relationships
    tenant: Mapped["Tenant"] = relationship("Tenant", foreign_keys="UsageEvent.tenant_id")
    user: Mapped[Optional["User"]] = relationship("User", foreign_keys=[user_id])
    api_key: Mapped[Optional["TenantApiKey"]] = relationship("TenantApiKey", foreign_keys=[api_key_id])
