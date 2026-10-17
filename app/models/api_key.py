from datetime import datetime
from typing import TYPE_CHECKING, List, Optional
from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import JSON

from app.core.database import Base
from app.models.base import TenantMixin

if TYPE_CHECKING:
    from app.models.tenant import Tenant
    from app.models.user import User
    from app.models.ai_profile import Persona


class TenantApiKey(Base, TenantMixin):
    """
    Developer API keys for programmatic tenant-level access.
    Secrets are never stored in plaintext - only a public prefix and HMAC-SHA256 hash.
    """
    __tablename__ = "tenant_api_keys"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    key_prefix: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    key_hash: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    
    # Authorized scopes for this key e.g. ["chat:read", "chat:write", "sources:read", "sources:write"]
    scopes: Mapped[List[str]] = mapped_column(
        JSON,
        default=lambda: ["chat:read", "chat:write", "sources:read", "sources:write"],
        nullable=False
    )
    
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False, index=True)
    expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    last_used_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    revoked_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    
    created_by_user_id: Mapped[Optional[int]] = mapped_column(
        Integer,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True
    )

    persona_id: Mapped[Optional[int]] = mapped_column(
        Integer,
        ForeignKey("personas.id", ondelete="SET NULL"),
        nullable=True,
        index=True
    )

    # Relationships
    tenant: Mapped["Tenant"] = relationship("Tenant", foreign_keys="TenantApiKey.tenant_id")
    created_by: Mapped[Optional["User"]] = relationship("User", foreign_keys=[created_by_user_id])
    persona: Mapped[Optional["Persona"]] = relationship("Persona", foreign_keys=[persona_id])
