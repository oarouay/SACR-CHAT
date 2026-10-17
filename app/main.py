import time
import uuid
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.utils import get_openapi
from fastapi.responses import JSONResponse

from app.api.v1.router import api_v1_router
from app.core.config import settings
from app.core.database import init_db


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan context manager for startup and shutdown events."""
    # Initialize database tables on startup
    await init_db()
    yield
    # Cleanup actions on shutdown (if any)


app = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    docs_url="/docs",
    redoc_url="/redoc",
    description="Multi-Tenant GraphRAG Platform with JWT Auth, Developer API Keys, and Usage Observability.",
    version="1.0.0",
    lifespan=lifespan
)

# Request ID correlation & basic telemetry middleware
@app.middleware("http")
async def request_context_middleware(request: Request, call_next):
    # 1. Propagate or generate unique correlation request ID
    request_id = request.headers.get("X-Request-ID") or f"req_{uuid.uuid4().hex[:16]}"
    request.state.request_id = request_id
    start_time = time.perf_counter()
    request.state.start_time = start_time

    try:
        response: Response = await call_next(request)
    except Exception as exc:
        latency_ms = (time.perf_counter() - start_time) * 1000.0
        # If tenant context was captured, record the 500 error telemetry
        tenant_id = getattr(request.state, "tenant_id", None)
        if tenant_id:
            try:
                from app.core.database import AsyncSessionLocal
                from app.services.usage_service import record_usage_event
                async with AsyncSessionLocal() as session:
                    await record_usage_event(
                        db=session,
                        tenant_id=tenant_id,
                        request_id=request_id,
                        endpoint=request.url.path,
                        http_method=request.method,
                        status_code=500,
                        latency_ms=latency_ms,
                        auth_type=getattr(request.state, "auth_type", "unknown"),
                        user_id=getattr(request.state, "user_id", None),
                        api_key_id=getattr(request.state, "api_key_id", None),
                        event_type="api_error",
                    )
            except Exception:
                pass
        raise exc

    latency_ms = (time.perf_counter() - start_time) * 1000.0
    request.state.latency_ms = latency_ms
    response.headers["X-Request-ID"] = request_id
    return response


# Set up CORS middleware to support dashboard, local HTML files (origin 'null'), and external widget embeds
cors_origins = [str(origin) for origin in settings.BACKEND_CORS_ORIGINS] if settings.BACKEND_CORS_ORIGINS else []
if "null" not in cors_origins:
    cors_origins.append("null")

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_origin_regex=r".*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Custom OpenAPI specification including X-API-Key and Bearer Auth
def custom_openapi():
    if app.openapi_schema:
        return app.openapi_schema
    openapi_schema = get_openapi(
        title=settings.PROJECT_NAME,
        version="1.0.0",
        description="Multi-Tenant GraphRAG Platform with JWT Auth, Developer API Keys, and Usage Observability.",
        routes=app.routes,
    )
    if "components" not in openapi_schema:
        openapi_schema["components"] = {}
    if "securitySchemes" not in openapi_schema["components"]:
        openapi_schema["components"]["securitySchemes"] = {}

    openapi_schema["components"]["securitySchemes"]["ApiKeyAuth"] = {
        "type": "apiKey",
        "in": "header",
        "name": "X-API-Key",
        "description": "OmniGraph Developer API Key for programmatic access (Format: ogr_live_<hex>_<token>)",
    }
    app.openapi_schema = openapi_schema
    return app.openapi_schema


app.openapi = custom_openapi


@app.get("/", tags=["Health"])
async def root():
    """Root status and API metadata endpoint."""
    return {
        "app": settings.PROJECT_NAME,
        "status": "online",
        "docs": "/docs",
        "version": "1.0.0"
    }


@app.get("/health", tags=["Health"])
async def health_check():
    """Service health check endpoint."""
    return {"status": "healthy"}


# Include API v1 Router
app.include_router(api_v1_router, prefix=settings.API_V1_STR)
