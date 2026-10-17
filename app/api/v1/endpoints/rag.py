from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.dependencies.api_key import RequestPrincipal, get_request_principal
from app.models.ai_profile import Persona
from app.schemas.rag import RAGQueryRequest, RAGQueryResponse
from app.services.ai_profile_service import AIProfileService
from app.services.synthesis import RAGPipelineService
from app.services.usage_service import record_usage_event

router = APIRouter(prefix="/rag", tags=["Hybrid GraphRAG Synthesis"])


@router.post(
    "/query",
    response_model=RAGQueryResponse,
    summary="Ask a question and synthesize an answer combining pgvector and Neo4j Knowledge Graph"
)
async def query_graphrag(
    payload: RAGQueryRequest,
    request: Request,
    principal: RequestPrincipal = Depends(get_request_principal),
    db: AsyncSession = Depends(get_db)
):
    """
    Executes the full Hybrid GraphRAG pipeline:
    1. Extracts entities from the query question.
    2. Runs vector semantic search in PostgreSQL (`pgvector`) using Cosine Distance.
    3. Runs multi-hop graph traversal in Neo4j to find connected entity relationships.
    4. Fuses both knowledge representations into a unified context prompt.
    5. Synthesizes a grounded answer with verifiable document and graph citations.
    """
    if principal.is_api_key and "chat:read" not in principal.scopes and "*" not in principal.scopes:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="API key missing required scope 'chat:read'"
        )

    tenant = principal.tenant

    effective_persona_id = payload.persona_id or principal.persona_id
    profile = None
    active_persona = None
    try:
        profile, active_persona = await AIProfileService.get_or_create_default_profile(
            db=db, tenant_id=tenant.id, tenant_name=tenant.name
        )
        if effective_persona_id:
            p_stmt = select(Persona).where(Persona.id == effective_persona_id, Persona.tenant_id == tenant.id)
            p_res = await db.execute(p_stmt)
            req_p = p_res.scalar_one_or_none()
            if req_p:
                active_persona = req_p
    except Exception as prof_err:
        pass

    top_k = payload.top_k_chunks or (profile.retrieval_policy.get("topK", 4) if profile else 4)
    max_hops = payload.max_graph_hops or (profile.retrieval_policy.get("maxGraphDepth", 2) if profile else 2)
    tone = active_persona.tone if active_persona else "professional"

    res = await RAGPipelineService.answer_query(
        db=db,
        tenant_id=tenant.id,
        query=payload.query,
        top_k_chunks=top_k,
        max_graph_hops=max_hops,
        temperature=payload.temperature,
        source_id=payload.source_id,
        persona_tone=tone,
        tenant_name=tenant.name,
        ai_profile=profile,
        persona=active_persona,
    )

    req_id = getattr(request.state, "request_id", "req_unknown")
    latency = getattr(request.state, "latency_ms", res.execution_time_ms)
    await record_usage_event(
        db=db,
        tenant_id=principal.tenant_id,
        user_id=principal.user_id,
        api_key_id=principal.api_key_id,
        auth_type=principal.auth_type,
        request_id=req_id,
        event_type="rag_query",
        endpoint=request.url.path,
        http_method=request.method,
        status_code=200,
        latency_ms=latency,
        provider=getattr(res, "llm_provider", None),
        model=getattr(res, "llm_model", None),
        input_tokens=getattr(res, "input_tokens", None),
        output_tokens=getattr(res, "output_tokens", None),
        total_tokens=getattr(res, "total_tokens", None),
        source_count=len(res.source_citations),
    )

    return res
