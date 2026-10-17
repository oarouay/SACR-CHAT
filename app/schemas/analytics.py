from typing import List, Optional
from pydantic import BaseModel, ConfigDict, Field


class AnalyticsPeriod(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    from_date: Optional[str] = Field(None, serialization_alias="from")
    to_date: Optional[str] = Field(None, serialization_alias="to")


class DailyAnalytics(BaseModel):
    date: str
    messages: int
    api_requests: int
    tokens: int


class TenantAnalyticsResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    period: AnalyticsPeriod
    messages: int
    api_requests: int
    active_users: int
    input_tokens: int
    output_tokens: int
    total_tokens: int
    avg_latency_ms: float
    error_count: int
    daily: List[DailyAnalytics]
