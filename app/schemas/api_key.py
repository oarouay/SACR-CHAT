from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, ConfigDict, Field


VALID_SCOPES = [
    "chat:read",
    "chat:write",
    "sources:read",
    "sources:write",
]


class ApiKeyCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=100, description="Human-readable label for this key")
    expires_at: Optional[datetime] = Field(None, description="Optional UTC expiration date/time")
    scopes: Optional[List[str]] = Field(
        default_factory=lambda: list(VALID_SCOPES),
        description="Allowed permission scopes for this key"
    )
    persona_id: Optional[int] = Field(None, description="Optional persona ID to bind to this API key")


class ApiKeyResponse(BaseModel):
    """
    Public metadata response for an API key.
    The secret key is NEVER exposed in this schema.
    """
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    key_prefix: str
    masked_key: str
    scopes: List[str]
    is_active: bool
    created_at: datetime
    expires_at: Optional[datetime] = None
    last_used_at: Optional[datetime] = None
    revoked_at: Optional[datetime] = None
    persona_id: Optional[int] = None
    persona_name: Optional[str] = None


class ApiKeyCreatedResponse(ApiKeyResponse):
    """
    Returned exactly ONCE upon creation or rotation.
    Includes the full plaintext key which can never be viewed again.
    """
    key: str = Field(..., description="Full secret API key. Store this securely; it will NOT be shown again.")


class ApiKeyUsageDaily(BaseModel):
    date: str
    requests: int
    tokens: int


class ApiKeyUsageResponse(BaseModel):
    id: int
    name: str
    masked_key: str
    total_requests: int
    total_tokens: int
    error_count: int
    last_used_at: Optional[datetime] = None
    daily: List[ApiKeyUsageDaily]
