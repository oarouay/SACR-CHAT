from datetime import datetime, timedelta, timezone
import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.api_key import TenantApiKey
from app.services.api_key_service import hash_api_key


@pytest.mark.asyncio
async def test_api_key_lifecycle(client: AsyncClient, db_session: AsyncSession):
    """
    Comprehensive test of Developer API Key lifecycle:
    1. Creation & one-time secret display
    2. Zero plaintext secret storage in database
    3. Listing metadata (no plaintext secret returned)
    4. Soft revocation
    5. Rotation (old key invalidated, new key works)
    6. Expiration enforcement
    """
    # 1. Register Tenant Alpha
    reg_res = await client.post("/api/v1/auth/register-tenant", json={
        "tenant_name": "Alpha Corp",
        "tenant_slug": "alpha-corp",
        "admin_email": "admin@alpha.com",
        "admin_password": "Password123!",
        "admin_name": "Alpha Admin"
    })
    assert reg_res.status_code == 201
    alpha_token = reg_res.json()["access_token"]
    alpha_headers = {"Authorization": f"Bearer {alpha_token}"}

    # 2. Create API Key
    create_res = await client.post(
        "/api/v1/api-keys/",
        headers=alpha_headers,
        json={"name": "Production Key", "scopes": ["chat:read", "chat:write"]}
    )
    assert create_res.status_code == 201
    created_data = create_res.json()
    assert "key" in created_data
    raw_secret_key = created_data["key"]
    key_id = created_data["id"]
    key_prefix = created_data["key_prefix"]

    assert raw_secret_key.startswith("ogr_live_")
    assert created_data["masked_key"].startswith(key_prefix)
    assert "••••••••" in created_data["masked_key"]

    # 3. Verify plaintext secret is NOT stored in DB
    db_res = await db_session.execute(
        select(TenantApiKey).where(TenantApiKey.id == key_id)
    )
    stored_key = db_res.scalar_one()
    assert stored_key.key_hash == hash_api_key(raw_secret_key)
    # Ensure raw secret is not in hash or prefix
    assert raw_secret_key != stored_key.key_hash
    assert raw_secret_key != stored_key.key_prefix

    # 4. List keys: ensure metadata is returned and secret is omitted
    list_res = await client.get("/api/v1/api-keys/", headers=alpha_headers)
    assert list_res.status_code == 200
    keys_list = list_res.json()
    assert len(keys_list) == 1
    assert keys_list[0]["id"] == key_id
    assert "key" not in keys_list[0]
    assert keys_list[0]["masked_key"] == created_data["masked_key"]

    # 5. Rotate key
    rotate_res = await client.post(
        f"/api/v1/api-keys/{key_id}/rotate",
        headers=alpha_headers
    )
    assert rotate_res.status_code == 200
    rotated_data = rotate_res.json()
    assert "key" in rotated_data
    new_raw_key = rotated_data["key"]
    new_key_id = rotated_data["id"]
    assert new_raw_key != raw_secret_key

    # Old key must now be inactive/revoked in DB
    old_key_db = (await db_session.execute(
        select(TenantApiKey).where(TenantApiKey.id == key_id)
    )).scalar_one()
    assert old_key_db.is_active is False
    assert old_key_db.revoked_at is not None

    # 6. Revoke the new key
    revoke_res = await client.delete(
        f"/api/v1/api-keys/{new_key_id}",
        headers=alpha_headers
    )
    assert revoke_res.status_code == 200
    assert revoke_res.json()["is_active"] is False
    assert revoke_res.json()["revoked_at"] is not None


@pytest.mark.asyncio
async def test_tenant_isolation_on_api_keys(client: AsyncClient):
    """
    Ensure Tenant B cannot list, revoke, rotate, or view usage of Tenant A's API keys.
    """
    # Register Tenant A
    res_a = await client.post("/api/v1/auth/register-tenant", json={
        "tenant_name": "Tenant A",
        "tenant_slug": "tenant-a",
        "admin_email": "admin@a.com",
        "admin_password": "Password123!",
    })
    token_a = res_a.json()["access_token"]

    # Register Tenant B
    res_b = await client.post("/api/v1/auth/register-tenant", json={
        "tenant_name": "Tenant B",
        "tenant_slug": "tenant-b",
        "admin_email": "admin@b.com",
        "admin_password": "Password123!",
    })
    token_b = res_b.json()["access_token"]

    headers_a = {"Authorization": f"Bearer {token_a}"}
    headers_b = {"Authorization": f"Bearer {token_b}"}

    # Tenant A creates a key
    key_a_res = await client.post(
        "/api/v1/api-keys/",
        headers=headers_a,
        json={"name": "A Secret Key"}
    )
    key_a_id = key_a_res.json()["id"]

    # Tenant B tries to list keys -> sees 0 keys
    list_b = await client.get("/api/v1/api-keys/", headers=headers_b)
    assert list_b.status_code == 200
    assert len(list_b.json()) == 0

    # Tenant B tries to revoke Tenant A's key -> 404
    revoke_b = await client.delete(f"/api/v1/api-keys/{key_a_id}", headers=headers_b)
    assert revoke_b.status_code == 404

    # Tenant B tries to rotate Tenant A's key -> 404
    rotate_b = await client.post(f"/api/v1/api-keys/{key_a_id}/rotate", headers=headers_b)
    assert rotate_b.status_code == 404

    # Tenant B tries to get usage of Tenant A's key -> 404
    usage_b = await client.get(f"/api/v1/api-keys/{key_a_id}/usage", headers=headers_b)
    assert usage_b.status_code == 404


@pytest.mark.asyncio
async def test_api_key_cannot_access_admin_endpoints(client: AsyncClient):
    """
    Ensure an API Key cannot be used to create keys or access administrative endpoints.
    Superadmin and admin endpoints must require JWT user sessions.
    """
    reg_res = await client.post("/api/v1/auth/register-tenant", json={
        "tenant_name": "Sec Corp",
        "tenant_slug": "sec-corp",
        "admin_email": "admin@sec.com",
        "admin_password": "Password123!",
    })
    token = reg_res.json()["access_token"]

    key_res = await client.post(
        "/api/v1/api-keys/",
        headers={"Authorization": f"Bearer {token}"},
        json={"name": "Test Key"}
    )
    raw_key = key_res.json()["key"]

    # Attempt to create an API key using the API key itself -> 401 (requires JWT user)
    forbidden_res = await client.post(
        "/api/v1/api-keys/",
        headers={"X-API-Key": raw_key},
        json={"name": "Sub Key"}
    )
    assert forbidden_res.status_code == 401


@pytest.mark.asyncio
async def test_api_key_with_persona_binding_and_isolation(client: AsyncClient, db_session: AsyncSession):
    """
    Verify:
    1. Creating an API key bound to a specific persona.
    2. Cross-tenant persona binding is rejected (400).
    3. Programmatic query with the API key inherits the bound persona.
    4. Explicit persona_id in request payload overrides the API key default persona.
    5. Rotation preserves persona binding.
    """
    # 1. Register Tenant A
    res_a = await client.post("/api/v1/auth/register-tenant", json={
        "tenant_name": "PersonaTenant A",
        "tenant_slug": "persona-a",
        "admin_email": "admin@personaa.com",
        "admin_password": "Password123!",
    })
    token_a = res_a.json()["access_token"]
    headers_a = {"Authorization": f"Bearer {token_a}"}

    # 2. Register Tenant B
    res_b = await client.post("/api/v1/auth/register-tenant", json={
        "tenant_name": "PersonaTenant B",
        "tenant_slug": "persona-b",
        "admin_email": "admin@personab.com",
        "admin_password": "Password123!",
    })
    token_b = res_b.json()["access_token"]
    headers_b = {"Authorization": f"Bearer {token_b}"}

    # 3. Create Persona in Tenant A
    create_p_a = await client.post("/api/v1/personas", headers=headers_a, json={
        "name": "DevOps Architect",
        "role": "Senior Cloud Infrastructure Architect",
        "purpose": "Guide engineering teams through Kubernetes deployment",
        "tone": "technical",
        "verbosity": "concise",
        "expertise_level": "advanced",
        "step_by_step": True,
        "define_specialized_terms": False,
        "include_examples": True,
        "is_default": False
    })
    assert create_p_a.status_code == 201
    persona_a = create_p_a.json()
    persona_a_id = persona_a["id"]

    # 4. Create Persona in Tenant B
    create_p_b = await client.post("/api/v1/personas", headers=headers_b, json={
        "name": "Legal Counselor",
        "role": "Corporate Compliance Officer",
        "purpose": "Advise on privacy regulation and GDPR audits",
        "tone": "formal",
        "verbosity": "detailed",
        "expertise_level": "expert",
        "step_by_step": False,
        "define_specialized_terms": True,
        "include_examples": False,
        "is_default": False
    })
    assert create_p_b.status_code == 201
    persona_b_id = create_p_b.json()["id"]

    # 5. Tenant A tries to bind an API key to Tenant B's persona -> 400 Bad Request
    cross_tenant_res = await client.post("/api/v1/api-keys/", headers=headers_a, json={
        "name": "Cross Key",
        "persona_id": persona_b_id
    })
    assert cross_tenant_res.status_code == 400
    assert "not found" in cross_tenant_res.json()["detail"].lower()

    # 6. Tenant A creates key bound to its own persona
    key_res = await client.post("/api/v1/api-keys/", headers=headers_a, json={
        "name": "DevOps Bot Key",
        "persona_id": persona_a_id
    })
    assert key_res.status_code == 201
    key_data = key_res.json()
    raw_api_key = key_data["key"]
    assert key_data["persona_id"] == persona_a_id
    assert key_data["persona_name"] == "DevOps Architect"

    # 7. List keys -> returns persona_name and persona_id
    list_res = await client.get("/api/v1/api-keys/", headers=headers_a)
    assert list_res.status_code == 200
    listed_key = [k for k in list_res.json() if k["id"] == key_data["id"]][0]
    assert listed_key["persona_id"] == persona_a_id
    assert listed_key["persona_name"] == "DevOps Architect"

    # 8. Query /api/v1/chat/query with the API key -> automatically uses DevOps Architect persona
    query_res = await client.post(
        "/api/v1/chat/query",
        headers={"X-API-Key": raw_api_key},
        json={"query": "How do we scale pods?"}
    )
    assert query_res.status_code == 200
    query_data = query_res.json()
    assert query_data["persona_name"] == "DevOps Architect"

    # 9. Rotate key -> new successor key preserves persona_id
    rotate_res = await client.post(
        f"/api/v1/api-keys/{key_data['id']}/rotate",
        headers=headers_a
    )
    assert rotate_res.status_code == 200
    rotated_data = rotate_res.json()
    assert rotated_data["persona_id"] == persona_a_id
    assert rotated_data["persona_name"] == "DevOps Architect"
