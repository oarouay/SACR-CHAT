import json
import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.usage import UsageEvent
from app.services.usage_service import record_usage_event


@pytest.mark.asyncio
async def test_request_id_middleware(client: AsyncClient):
    """Ensure X-Request-ID header is always generated and propagated on responses."""
    # 1. Without client request-id header -> server generates one
    res1 = await client.get("/health")
    assert res1.status_code == 200
    assert "x-request-id" in res1.headers
    assert res1.headers["x-request-id"].startswith("req_")

    # 2. With client request-id header -> server reflects it
    custom_id = "test-custom-req-id-12345"
    res2 = await client.get("/health", headers={"X-Request-ID": custom_id})
    assert res2.status_code == 200
    assert res2.headers["x-request-id"] == custom_id


@pytest.mark.asyncio
async def test_api_key_chat_and_telemetry(client: AsyncClient, db_session: AsyncSession):
    """
    End-to-end integration test:
    1. Register tenant & login
    2. Create Developer API Key
    3. Use API Key (X-API-Key) to create conversation and send chat message
    4. Verify UsageEvent is persisted with tenant_id, api_key_id, request_id, event_type, status_code, latency
    5. Query tenant analytics and assert aggregated totals match
    """
    # 1. Register Tenant
    reg_res = await client.post("/api/v1/auth/register-tenant", json={
        "tenant_name": "Telemetry Inc",
        "tenant_slug": "telemetry-inc",
        "admin_email": "admin@telemetry.com",
        "admin_password": "Password123!",
    })
    assert reg_res.status_code == 201
    jwt_token = reg_res.json()["access_token"]
    tenant_id = reg_res.json()["tenant"]["id"]

    # 2. Create API key with all scopes
    key_res = await client.post(
        "/api/v1/api-keys/",
        headers={"Authorization": f"Bearer {jwt_token}"},
        json={"name": "Chat Bot Key", "scopes": ["chat:read", "chat:write", "sources:read", "sources:write"]}
    )
    assert key_res.status_code == 201
    raw_api_key = key_res.json()["key"]
    api_key_id = key_res.json()["id"]

    # 3. Create conversation using API Key
    conv_res = await client.post(
        "/api/v1/chat/conversations",
        headers={"X-API-Key": raw_api_key},
        json={"title": "Programmatic Session"}
    )
    assert conv_res.status_code == 201
    conv_id = conv_res.json()["id"]

    # 4. List conversations using API Key
    list_conv = await client.get(
        "/api/v1/chat/conversations",
        headers={"X-API-Key": raw_api_key}
    )
    assert list_conv.status_code == 200
    assert len(list_conv.json()) == 1

    # 5. Send message using API Key
    msg_res = await client.post(
        f"/api/v1/chat/conversations/{conv_id}/messages",
        headers={"X-API-Key": raw_api_key, "X-Request-ID": "test-chat-req-001"},
        json={"message": "Hello GraphRAG agent!"}
    )
    assert msg_res.status_code == 201
    assert "content" in msg_res.json()

    # 6. Verify UsageEvent recorded in database
    events_stmt = (
        select(UsageEvent)
        .where(UsageEvent.tenant_id == tenant_id)
        .order_by(UsageEvent.created_at.desc())
    )
    events_res = await db_session.execute(events_stmt)
    events = events_res.scalars().all()
    assert len(events) >= 1

    chat_event = events[0]
    assert chat_event.tenant_id == tenant_id
    assert chat_event.api_key_id == api_key_id
    assert chat_event.auth_type == "api_key"
    assert chat_event.request_id == "test-chat-req-001"
    assert chat_event.event_type == "chat"
    assert chat_event.status_code == 201
    assert chat_event.latency_ms >= 0

    # 7. Check API key usage endpoint
    key_usage_res = await client.get(
        f"/api/v1/api-keys/{api_key_id}/usage",
        headers={"Authorization": f"Bearer {jwt_token}"}
    )
    assert key_usage_res.status_code == 200
    usage_data = key_usage_res.json()
    assert usage_data["id"] == api_key_id
    assert usage_data["total_requests"] >= 1
    assert usage_data["error_count"] == 0

    # 8. Check Tenant Analytics aggregation endpoint
    analytics_res = await client.get(
        "/api/v1/tenants/analytics",
        headers={"Authorization": f"Bearer {jwt_token}"}
    )
    assert analytics_res.status_code == 200
    analytics_data = analytics_res.json()
    assert analytics_data["messages"] >= 1
    assert analytics_data["api_requests"] >= 1
    assert "daily" in analytics_data
    assert len(analytics_data["daily"]) >= 1


@pytest.mark.asyncio
async def test_scope_enforcement_on_api_keys(client: AsyncClient):
    """
    Verify that an API key missing a scope is blocked with 403 Forbidden.
    """
    reg_res = await client.post("/api/v1/auth/register-tenant", json={
        "tenant_name": "Scope Test Org",
        "tenant_slug": "scope-test-org",
        "admin_email": "admin@scopetest.com",
        "admin_password": "Password123!",
    })
    jwt_token = reg_res.json()["access_token"]

    # Create read-only key
    ro_key_res = await client.post(
        "/api/v1/api-keys/",
        headers={"Authorization": f"Bearer {jwt_token}"},
        json={"name": "Read Only Key", "scopes": ["chat:read", "sources:read"]}
    )
    assert ro_key_res.status_code == 201
    ro_key = ro_key_res.json()["key"]

    # 1. Read operations succeed
    list_res = await client.get("/api/v1/chat/conversations", headers={"X-API-Key": ro_key})
    assert list_res.status_code == 200

    # 2. Write operation fails with 403 Forbidden
    create_res = await client.post(
        "/api/v1/chat/conversations",
        headers={"X-API-Key": ro_key},
        json={"title": "Should Fail"}
    )
    assert create_res.status_code == 403
    assert "chat:write" in create_res.json()["detail"]


@pytest.mark.asyncio
async def test_tenant_isolation_on_analytics(client: AsyncClient, db_session: AsyncSession):
    """
    Ensure Tenant A and Tenant B analytics are 100% isolated:
    Tenant A's events never appear in Tenant B's analytics.
    """
    # Tenant Alpha
    res_a = await client.post("/api/v1/auth/register-tenant", json={
        "tenant_name": "Alpha Analytics",
        "tenant_slug": "alpha-ana",
        "admin_email": "admin@alpha-ana.com",
        "admin_password": "Password123!",
    })
    token_a = res_a.json()["access_token"]
    id_a = res_a.json()["tenant"]["id"]

    # Tenant Beta
    res_b = await client.post("/api/v1/auth/register-tenant", json={
        "tenant_name": "Beta Analytics",
        "tenant_slug": "beta-ana",
        "admin_email": "admin@beta-ana.com",
        "admin_password": "Password123!",
    })
    token_b = res_b.json()["access_token"]
    id_b = res_b.json()["tenant"]["id"]

    # Record 5 mock events for Tenant A
    for i in range(5):
        await record_usage_event(
            db=db_session,
            tenant_id=id_a,
            request_id=f"alpha-req-{i}",
            endpoint="/api/v1/chat/conversations",
            http_method="POST",
            status_code=201,
            latency_ms=120.0,
            event_type="chat",
            total_tokens=1000,
        )

    # Query analytics for Tenant A -> 5 messages
    ana_a = await client.get("/api/v1/tenants/analytics", headers={"Authorization": f"Bearer {token_a}"})
    assert ana_a.status_code == 200
    assert ana_a.json()["messages"] == 5
    assert ana_a.json()["total_tokens"] == 5000

    # Query analytics for Tenant B -> 0 messages (strict isolation)
    ana_b = await client.get("/api/v1/tenants/analytics", headers={"Authorization": f"Bearer {token_b}"})
    assert ana_b.status_code == 200
    assert ana_b.json()["messages"] == 0
    assert ana_b.json()["total_tokens"] == 0


@pytest.mark.asyncio
async def test_streaming_chat_telemetry_finalization(client: AsyncClient, db_session: AsyncSession):
    """
    Ensure SSE streaming chat records and finalizes usage event only upon completion.
    """
    reg_res = await client.post("/api/v1/auth/register-tenant", json={
        "tenant_name": "Stream Tel Inc",
        "tenant_slug": "stream-tel",
        "admin_email": "admin@streamtel.com",
        "admin_password": "Password123!",
    })
    token = reg_res.json()["access_token"]
    tenant_id = reg_res.json()["tenant"]["id"]
    headers = {"Authorization": f"Bearer {token}"}

    # Create conversation
    conv_res = await client.post(
        "/api/v1/chat/conversations",
        headers=headers,
        json={"title": "SSE Session"}
    )
    conv_id = conv_res.json()["id"]

    # Stream chat message
    stream_res = await client.post(
        f"/api/v1/chat/conversations/{conv_id}/messages/stream",
        headers={**headers, "X-Request-ID": "sse-req-999"},
        json={"message": "Stream a grounded answer"}
    )
    assert stream_res.status_code == 200
    stream_body = stream_res.text
    assert "event: token" in stream_body or "event: metadata" in stream_body
    assert "event: done" in stream_body

    # Verify UsageEvent recorded with event_type="chat_stream" and status_code=200
    ev_stmt = select(UsageEvent).where(
        UsageEvent.tenant_id == tenant_id,
        UsageEvent.event_type == "chat_stream",
        UsageEvent.request_id == "sse-req-999"
    )
    ev_res = await db_session.execute(ev_stmt)
    event = ev_res.scalar_one_or_none()
    assert event is not None
    assert event.status_code == 200
    assert event.latency_ms > 0
    assert event.conversation_id == conv_id
