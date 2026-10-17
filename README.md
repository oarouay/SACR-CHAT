# Enterprise Multi-Tenant GraphRAG SaaS Platform

A production-ready, full-stack enterprise GraphRAG platform featuring Multi-Tenant Isolation, Hybrid Vector + Knowledge Graph Retrieval (pgvector + Neo4j), Multi-Model Synthesis (Google Gemini & OpenAI), Developer API Key Management with Granular RBAC, Usage Tracking & Observability, and an Embeddable Shadow DOM Chat Widget.

---

## 🏗️ Architecture & Core Capabilities

- **Hybrid GraphRAG Retrieval**: Combines unstructured vector search (**PostgreSQL `pgvector`** with HNSW indexing) and relational graph traversals (**Neo4j 5.26**) executed concurrently via `asyncio.gather` for deep relational and semantic recall.
- **Strict Multi-Tenant Row-Level Isolation**: Every database entity, vector embedding, file storage path, and Cypher graph query enforces a mandatory `tenant_id` filter derived directly from authenticated context (`get_current_tenant` / `get_api_key_auth`).
- **Developer API Key Management**: Programmatic integration engine using high-entropy keys (`omni_live_` + 256 bits entropy), one-way SHA-256 hash storage, prefix masking (`omni_live_••••...4a9f`), fine-grained RBAC scopes, persona binding, and zero-downtime atomic key rotation.
- **Usage Tracking & Observability Dashboard**: Non-blocking asynchronous telemetry pipeline logging token consumption (`tokens_in`, `tokens_out`), latency ($ms$), HTTP status codes, and endpoint attribution into `usage_records` with rolling daily time-series analytics.
- **Embeddable Micro-Frontend Widget (`widget.js`)**: Single-script embed using the native **Open Shadow DOM** API for 100% CSS style isolation, script-level persona binding (`data-persona-id`), Claude/ChatGPT-style smoothed SSE streaming, and an Anti-UI-Slop calm visual aesthetic with plain-language business terminology.
- **Multi-Model LLM Resilience & Failover**: Pluggable synthesis engine supporting **Google Gemini 2.5 Flash** and **OpenAI GPT-4o / GPT-4o mini** with automatic dynamic failover on rate-limiting (HTTP 429) or quota exhaustion.
- **Hierarchical AI Governance & Persona Engine**: Two-tier governance pairing Organization AI Profiles with custom sub-personas, compiled deterministically across a 6-layer invariant hierarchy with source authority reranking and citation validation.
- **Real-Time Token Streaming**: Server-Sent Events (SSE) streaming delivering sub-second initial token response times alongside verified source citations and graph traversal paths.

---

## 📁 Project Structure

```
├── app/
│   ├── api/
│   │   └── v1/
│   │       ├── endpoints/
│   │       │   ├── auth.py              # /register-tenant, /login, /me
│   │       │   ├── api_keys.py          # /api-keys (create, list, revoke, rotate)
│   │       │   ├── analytics.py         # /analytics/tenant (usage telemetry & charts)
│   │       │   ├── chat.py              # /chat/query, /chat/stream, /chat/public/{slug}
│   │       │   ├── rag.py               # /rag/query, /rag/stream (direct hybrid RAG)
│   │       │   ├── graph.py             # /graph/stats, /graph/neighborhood
│   │       │   ├── sources.py           # /sources (upload, raw-text, chunks, reprocess)
│   │       │   ├── tenants.py           # /current, /users, /chatbot-config
│   │       │   ├── ai_profile.py        # /ai-profiles, /personas, /versions, /evals
│   │       │   └── items.py             # Sample tenant-isolated resource
│   │       └── router.py                # Aggregated v1 route registration
│   ├── core/
│   │   ├── config.py                    # Pydantic Settings & environment variables
│   │   ├── database.py                  # Async SQLAlchemy 2.0 engine & sessionmaker
│   │   └── security.py                  # Bcrypt password hashing & JWT utilities
│   ├── dependencies/
│   │   ├── auth.py                      # get_current_user & role-based checks
│   │   ├── tenant.py                    # get_current_tenant & TenantContext
│   │   └── api_key.py                   # get_api_key_auth & require_scope
│   ├── models/
│   │   ├── base.py                      # Declarative Base & TenantMixin
│   │   ├── tenant.py                    # Tenant model
│   │   ├── user.py                      # User model
│   │   ├── api_key.py                   # ApiKey model (SHA-256 hashed secret storage)
│   │   ├── usage.py                     # UsageRecord telemetry model
│   │   ├── ai_profile.py                # AIProfile, AIPersona, ProfileVersion, EvalCase
│   │   ├── conversation.py              # Conversation & ChatMessage models
│   │   ├── source.py                    # Knowledge Source model
│   │   └── chunk.py                     # DocumentChunk model (with pgvector embedding)
│   ├── schemas/
│   │   ├── auth.py                      # JWT & Login schemas
│   │   ├── api_key.py                   # ApiKeyCreate, ApiKeyResponse, ApiKeyCreatedResponse
│   │   ├── analytics.py                 # UsageRecordSchema, TenantAnalyticsResponse
│   │   ├── ai_profile.py                # Profile & Persona schemas
│   │   ├── conversation.py              # Chat request & history schemas
│   │   ├── rag.py                       # RAG query, response, and citation schemas
│   │   ├── synthesis.py                 # Synthesizer context & prompt schemas
│   │   └── source.py                    # File upload & raw-text schemas
│   ├── services/
│   │   ├── api_key_service.py           # High-entropy generation, SHA-256 hashing & rotation
│   │   ├── usage_service.py             # Non-blocking telemetry tracking & daily rollups
│   │   ├── rag_pipeline.py              # Hybrid retrieval orchestrator (Vector + Neo4j)
│   │   ├── synthesis.py                 # Multi-model synthesis (Gemini 2.5 & OpenAI failover)
│   │   ├── disambiguation.py           # Entity extraction & Cypher query synthesis
│   │   ├── neo4j.py                     # Neo4j async driver, schema constraints & traversals
│   │   ├── search.py                    # pgvector Cosine Distance search service
│   │   ├── embedding.py                 # Gemini text-embedding-004 & mock embedding engine
│   │   ├── chunking.py                  # RecursiveTextSplitter with sliding overlap
│   │   ├── parser.py                    # Multi-format document parser (PDF, DOCX, TXT, CSV)
│   │   ├── storage.py                   # Tenant-isolated file system storage
│   │   └── pipeline.py                  # BackgroundTasks document processing pipeline
│   └── main.py                          # FastAPI application initialization & lifespan
├── frontend/
│   ├── public/
│   │   └── widget.js                    # Embeddable micro-frontend widget (Shadow DOM)
│   ├── src/
│   │   ├── components/
│   │   │   ├── ApiKeyManager.jsx        # Developer API Key management & rotation UI
│   │   │   ├── ObservabilityDashboard.jsx # Usage telemetry charts & consumption KPIs
│   │   │   ├── Integrations.jsx         # Widget embed codes & API developer integration tabs
│   │   │   ├── AIProfileAdmin.jsx       # Unified AI governance hub & policy editor
│   │   │   ├── PersonaManager.jsx       # Custom persona CRUD & trait management
│   │   │   ├── AIProfilePlayground.jsx  # Multi-persona prompt testing bench & audit drawer
│   │   │   ├── OnboardingWizard.jsx     # 7-Step guided AI profile configuration
│   │   │   ├── ChatStudio.jsx           # Real-time chat with streaming & citations
│   │   │   ├── GraphExplorer.jsx        # Interactive vis-network knowledge graph visualizer
│   │   │   ├── SourceManager.jsx        # Document upload & knowledge source management
│   │   │   └── SidebarNav.jsx           # Main navigation drawer
│   │   ├── api/
│   │   │   └── client.js                # Axios client with JWT & error interceptors
│   │   └── App.jsx                      # Root application layout & route state
│   ├── package.json
│   └── vite.config.js
├── tests/
│   ├── conftest.py                      # Async SQLite fixtures & memory test database
│   ├── test_api_keys.py                 # API Key generation, hashing, scopes & rotation tests
│   ├── test_usage_and_analytics.py      # Telemetry tracking & date-bucketed analytics tests
│   ├── test_auth_and_tenant.py          # Tenant isolation & JWT security tests
│   ├── test_chatbot_and_chat.py         # Multi-turn chat & public widget endpoint tests
│   ├── test_ai_profile_system.py        # Profile versioning, persona precedence & eval tests
│   ├── test_grounded_synthesis.py       # Dual-synthesizer (Gemini/OpenAI) failover tests
│   ├── test_streaming_synthesis.py      # SSE token streaming & citation verification tests
│   ├── test_conversational_router.py    # Intent routing & disambiguation tests
│   ├── test_graph.py                    # Neo4j entity extraction & graph isolation tests
│   ├── test_graph_disambiguation.py     # Graph query disambiguation tests
│   ├── test_embeddings_and_search.py    # pgvector semantic vector search tests
│   ├── test_sources.py                  # Document upload & storage isolation tests
│   ├── test_pipeline.py                 # Parser, chunker & background worker tests
│   ├── test_crawler_ssl.py              # Web page crawling & SSRF protection tests
│   ├── test_optimizations.py            # Latency, caching & batch retrieval tests
│   └── test_rag.py                      # End-to-end RAG pipeline integration tests
├── docker-compose.yml                   # PostgreSQL (pgvector) & Neo4j containers
├── requirements.txt                     # Backend Python dependencies
└── README.md
```

---

## 🚀 Quickstart Guide

### 1. Start Infrastructure Containers (PostgreSQL + Neo4j)

```bash
docker compose up -d
```
* **PostgreSQL (pgvector)**: Port `5432`
* **Neo4j Community 5.26**: Port `7474` (Web Browser) & `7687` (Bolt Protocol)

### 2. Backend Setup & Run

```powershell
# Create and activate virtual environment (Windows PowerShell)
py -m venv venv
.\venv\Scripts\Activate.ps1

# Install backend dependencies
pip install -r requirements.txt

# Run database migrations
alembic upgrade head

# Start FastAPI development server
uvicorn app.main:app --reload --port 8000
```

- API Base URL: `http://localhost:8000`
- Interactive Swagger UI: `http://localhost:8000/docs`
- ReDoc Documentation: `http://localhost:8000/redoc`

### 3. Frontend Setup & Run

```bash
cd frontend
npm install
npm run dev
```

- Web Dashboard: `http://localhost:5173`

---

## 🔑 Developer API Key Management & RBAC Scopes

OmniGraph provides programmatic access for automated backend pipelines, customer applications, and webhooks without exposing personal user credentials:

### Cryptographic Security Model
1. **High-Entropy Generation**: Keys are prefixed with `omni_live_` followed by 32 bytes of cryptographic randomness ($256$ bits of entropy via `secrets.token_hex(32)`).
2. **One-Way SHA-256 Storage**: Plaintext keys are returned to the developer **exactly once** upon creation. The database exclusively stores the cryptographic hash:
   $$\text{hashed\_key} = \text{SHA-256}(\text{raw\_key})$$
3. **Prefix & Mask Display**: Safe identification in dashboard tables via `omni_live_••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••4a9f`.
4. **Dual Header Authentication**: Clients can authenticate with either:
   - `X-API-Key: omni_live_...`
   - `Authorization: Bearer omni_live_...`
5. **Zero-Downtime Atomic Rotation**: `POST /api/v1/api-keys/{id}/rotate` generates a new key with identical name, scopes, and persona bindings while atomically revoking the previous key in a single database transaction.

### Granular RBAC Scopes
| Scope | Description |
| :--- | :--- |
| `chat:read` | Inspect conversation history and historical messages |
| `chat:write` | Submit questions, execute hybrid RAG queries, receive SSE streams |
| `sources:read` | List ingested sources and view document metadata |
| `sources:write` | Upload documents, ingest raw text, trigger reprocessing, delete sources |

### API Endpoints
- `POST /api/v1/api-keys`: Create a new scoped API key (supports optional `persona_id` binding).
- `GET /api/v1/api-keys`: List all active and revoked keys for the authenticated tenant.
- `DELETE /api/v1/api-keys/{id}`: Instantly soft-revoke an API key.
- `POST /api/v1/api-keys/{id}/rotate`: Atomically rotate an API key.

---

## 📊 Usage Tracking & Observability Engine

Every operational request processed by the platform generates asynchronous, non-blocking telemetry records in `usage_records`:

### Tracked Telemetry Metrics
- **Tenant & Identity Attribution**: `tenant_id`, `api_key_id` (for programmatic queries), `user_id` (for dashboard sessions).
- **Endpoint & Status Code**: e.g., `/api/v1/chat/query`, `status_code: 200` (or `4xx`/`5xx` error states).
- **Token Consumption**: Input tokens (`tokens_in`), output tokens (`tokens_out`), and combined total (`total_tokens`).
- **Performance**: Execution latency recorded in milliseconds (`latency_ms`).

### Tenant Analytics API
- `GET /api/v1/analytics/tenant?from=...&to=...`:
  - **Aggregated Totals**: Total user messages, direct API requests, total tokens consumed, active distinct users, average latency ($ms$), and error count.
  - **Time-Series Daily Buckets**: Grouped by `DATE(timestamp)` for 7-day, 30-day, and 90-day interactive visualizations in the frontend **Observability Dashboard**.

---

## 🌐 Embeddable Chat Widget & Client-Centric UX

Clients can embed their custom-grounded AI assistant onto any website by including `widget.js`:

```html
<script 
  src="https://your-domain.com/widget.js" 
  data-tenant-slug="acme-corp" 
  data-persona-id="2"
  data-primary-color="#4F5BD5" 
  data-position="right"
  defer>
</script>
```

### Key Architectural Highlights
1. **Open Shadow DOM Encapsulation**: Complete isolation from host CSS frameworks (Tailwind, Bootstrap, etc.). Host site CSS rules cannot alter the widget, and widget styles cannot leak into the host page.
2. **Script-Level Persona Binding (`data-persona-id`)**: Enforces administrative brand consistency. Public visitors interact with the specific persona intended for that webpage (e.g. Sales Specialist on landing pages, Support Agent in docs). Visitor persona toggling is intentionally disabled to avoid brand dilution and prompt confusion.
3. **Anti-UI-Slop & Emil Kowalski Motion**:
   - Eliminated artificial, noisy glowing green active dots (`#10B981`) and unread badges in favor of a calm, centered launcher button.
   - Smooth token-by-token stream smoothing (Claude/ChatGPT-style animation buffer) with graceful fallback on network drops.
4. **Client-Centric Plain Language**: Technical database and AI jargon has been translated into clear, professional business terminology throughout the widget and client settings.

---

## 📂 Data Ingestion & Hybrid GraphRAG Engine

### 1. Document Parsing & Recursive Chunking
- **Supported Formats**: PDF (`pypdf` with scanned/empty detection), Word (`python-docx` extracting paragraphs and tables), Plaintext/Markdown/CSV with multi-encoding fallback (`utf-8`, `latin-1`, `cp1252`).
- **Recursive Character Splitter**: Hierarchical separators (`["\n\n", "\n", ". ", " "]`) with configurable chunk size (default: 1,000 chars / ~250 tokens) and sliding overlap (default: 200 chars / ~50 tokens).

### 2. Dual-Track Hybrid Retrieval
- **Vector Search (`pgvector`)**: 768-dimensional embeddings generated via Google Gemini `text-embedding-004`, ranked using Cosine Distance (`<=>`) with an HNSW index (`m=16, ef=64`).
- **Knowledge Graph (Neo4j)**: Automated entity and relationship extraction (`MANAGES`, `DEPENDS_ON`, `USES`) via Gemini with multi-hop Cypher neighborhood traversals.
- **Concurrent Execution**: Both retrieval tracks run concurrently via `asyncio.gather`, bounding retrieval time to $\max(T_{\text{vector}}, T_{\text{graph}})$.

---

## 📚 In-Depth Learning Guide

For a comprehensive, graduate-level breakdown of the system architecture, mathematical formulas, Cypher query invariants, and architectural trade-offs, refer to the complete guide:
👉 **[Comprehensive Architecture & Learning Guide](file:///c:/Users/USER/Desktop/Oussama/stage%20d%27ete%20premier/docs/LEARNING_GUIDE.md)**

---

## 🧪 Comprehensive Test Suite

The test suite contains 17 specialized test modules verifying tenant isolation, cryptographic hashing, RBAC scopes, telemetry, multi-model failover, and graph traversal correctness:

```bash
# Run the complete test suite
pytest tests/
```

| Test Module | Coverage Domain |
| :--- | :--- |
| `tests/test_api_keys.py` | Key generation, 256-bit entropy, SHA-256 lookup, RBAC scopes & atomic rotation |
| `tests/test_usage_and_analytics.py` | Non-blocking telemetry tracking, token accounting & daily date-bucketed analytics |
| `tests/test_auth_and_tenant.py` | Multi-tenant row isolation, user registration, JWT issuance & access control |
| `tests/test_chatbot_and_chat.py` | Multi-turn conversations, memory retention & public widget endpoint security |
| `tests/test_ai_profile_system.py` | Hierarchical persona precedence, version rollback & seed eval benchmarks |
| `tests/test_grounded_synthesis.py` | Multi-model synthesis (Gemini + OpenAI) & dynamic failover handling |
| `tests/test_streaming_synthesis.py` | Real-time SSE token streaming & verifiable citation validation |
| `tests/test_conversational_router.py` | Intent classification, conversational routing & disambiguation |
| `tests/test_graph.py` | Neo4j entity/relation extraction & tenant-isolated Cypher traversals |
| `tests/test_graph_disambiguation.py` | Graph entity resolution & query disambiguation |
| `tests/test_embeddings_and_search.py` | Vector embeddings generation & pgvector Cosine Distance search |
| `tests/test_sources.py` | Document upload, raw-text ingestion & file storage isolation |
| `tests/test_pipeline.py` | Document parser, recursive chunking & BackgroundTasks pipeline |
| `tests/test_crawler_ssl.py` | Web page ingestion, HTTP header validation & SSRF protection |
| `tests/test_optimizations.py` | Batched Cypher queries, non-blocking async LLM calls & query caching |
| `tests/test_rag.py` | End-to-end hybrid GraphRAG retrieval pipeline integration |
