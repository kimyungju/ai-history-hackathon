# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Colonial Archives Graph-RAG: an AI-powered research tool for querying colonial-era handwritten archive documents (English + Chinese) via a chatbot backed by a knowledge graph. Every answer must trace back to specific document pages — zero tolerance for hallucination.

**Current state**: Phases 1–4 code complete, Phase 5 mostly complete (5.1–5.3, 5.5–5.7 done). Backend **tested end-to-end with real data** — full 9-step ingestion pipeline works (OCR → chunk → embed → vector upsert → entity extraction → normalization → Neo4j MERGE). Query endpoint works with **archive-first approach**: parallel vector search + graph traversal → LLM generates from archive context only → web fallback with disclaimer only when archive can't answer. Frontend code complete with mobile responsive layout and refined archival design theme (Crimson Pro + Plus Jakarta Sans + IBM Plex Mono typography, warm stone/ink palette, animations). 63 tests (34 backend + 29 frontend). Only remaining: T11 GCP infra provisioning, 3.8 integration testing, 5.4 batch ingestion (deferred).

## Commands

```bash
# Run backend locally (use port 8090 if 8080 is stuck)
cd backend && pip install -r requirements.txt
uvicorn app.main:app --reload --port 8090
# Swagger docs at http://localhost:8090/docs

# Run frontend
cd frontend && npm install && npm run dev

# Run via Docker Compose
cd infra && docker-compose up --build
# Requires GCP credentials — see backend/.env.example

# Backend tests (use Python 3.13, not 3.14 which lacks vertexai)
cd backend && "C:/Users/yjkim/AppData/Local/Programs/Python/Python313/python.exe" -m pytest tests/ -v
# 34 tests: 6 formatter + 3 trace + 2 log_stage + 1 health + 10 hybrid_retrieval + 2 admin + 3 web_search + 4 phase4 + 3 vector_config

# Frontend tests
cd frontend && npx vitest run
# 29 tests across 5 test files

# Lint
cd backend && ruff check app/
cd frontend && npx eslint src/

# gcloud auth (run in PowerShell, not bash)
gcloud auth application-default login
gcloud config set project aihistory-488807
```

## Architecture

**Stack**: FastAPI (Python 3.11) + Google Cloud services (Document AI, Vertex AI, Cloud Storage, Vector Search) + Neo4j AuraDB. No LangChain/LlamaIndex — direct SDK calls for traceability and control.

### Backend Layout (`backend/app/`)

- `main.py` — FastAPI app, CORS, Vertex AI init + Neo4j init/close in lifespan, router registration, health check with Neo4j status
- `config/settings.py` — Pydantic Settings reading from `.env`. Values with `PLACEHOLDER_*` defaults must be replaced. Tunable thresholds have working defaults.
- `config/document_categories.json` — Maps PDF filenames → 5 predefined archive categories
- `models/schemas.py` — All Pydantic v2 models (requests, responses, internal types like `Chunk`, `Evidence`, `EntityExtractionResult`, `GraphNode/Edge/Payload`)
- `routers/` — Thin HTTP layer: `ingest.py` (PDF ingestion + entity extraction + Neo4j), `query.py` (Q&A + signed URLs), `graph.py` (entity search + subgraph retrieval), `admin.py` (OCR quality + document listing)
- `services/` — Business logic, one service per concern:
  - `storage.py` — Cloud Storage read/write/signed URLs
  - `ocr.py` — Document AI OCR with page batching (15/batch) and semaphore concurrency (5)
  - `chunking.py` — Text cleaning + sliding window (450 tokens, 100 overlap), page-span tracking, CJK language detection
  - `embeddings.py` — Vertex AI text-embedding-004, batch size 250
  - `vector_search.py` — Vertex AI Vector Search upsert (batch 100) and nearest-neighbor search; resilient `_parse_endpoint_name()` handles domain/ID/resource-name formats
  - `llm.py` — Gemini 2.0 Flash with archive-focused prompt + separate `WEB_FALLBACK_PROMPT`; `generate_answer()` accepts optional `prompt_template` parameter; temperature 0.1
  - `entity_extraction.py` — Gemini structured JSON output for entities + relationships per chunk
  - `entity_normalization.py` — Three-stage dedup (exact match, embedding similarity, fuzzy string via rapidfuzz)
  - `neo4j_service.py` — Async Neo4j driver, MERGE entities/relationships, subgraph traversal, entity search
  - `hybrid_retrieval.py` — Orchestrates archive-first query: parallel vector search + graph traversal → LLM with archive-only context → web fallback with disclaimer if archive can't answer. Scoring uses `1 - cosine_distance` for similarity.
  - `web_search.py` — Tavily web search fallback, only triggered when archive LLM returns fallback answer
  - `auto_classification.py` — Gemini-based document category classification for unmapped PDFs

### Data Flow

**Ingestion** (9 steps): PDF (GCS) → Document AI OCR → clean+chunk → embed → vector upsert → entity extraction (Gemini) → entity normalization → Neo4j MERGE. Steps 7-9 (graph) are non-blocking — vector ingestion succeeds even if graph fails.

**Query** (archive-first): Question → embed + extract entity hints (case-insensitive) → parallel (vector search + graph traversal) → merge archive context → score (`(1-distance)*0.6 + graph_ratio*0.4`) → Gemini generates answer from archive-only context with `[archive:N]` citations → if archive can't answer → web search → Gemini with web context + disclaimer prefix → response includes GraphPayload.

### Key Design Decisions

- **Module-level singletons** for all services (imported directly, no DI framework)
- **Async throughout** with `asyncio.gather` for parallel I/O and `run_in_executor` for blocking SDK calls
- **MERGE not CREATE** in Neo4j for idempotent re-ingestion
- **No auth** — data is publicly digitized archives; researchers need friction-free access
- **Category filtering** via Vector Search namespace restricts, not separate indexes
- **Relationships stored as `RELATED_TO`** with `rel_type` property (Neo4j doesn't support parameterized relationship types without APOC)
- **Entity normalization thresholds**: `ENTITY_SIMILARITY_THRESHOLD=0.85` for auto-merge, `ENTITY_CONFIDENCE_MIN=0.5` to discard low-confidence extractions
- **Entity hint extraction** from queries uses regex (capitalized words/phrases), not LLM, to keep latency low
- **Dual-region architecture**: asia-southeast1 for storage/OCR/embeddings/vector search; us-central1 for Gemini LLM (not available in SEA). `VERTEX_LLM_REGION` setting controls LLM region.
- **Lazy initialization** for all GCP service clients (deferred to first use, not import time) — required because `vertexai.init()` runs in FastAPI lifespan, after imports

## Planning Documents

- `dev/active/colonial-archives-graph-rag/` — Context doc (architecture reference), plan, and task breakdown (5 phases)
- `docs/plans/` — Design documents, implementation plans for each phase
- `docs/plans/2026-03-01-phase5-remaining-tasks.md` — Phase 5 execution plan (5.2, 5.3, 5.5, 5.6)
- `docs/plans/2026-03-01-frontend-design-refinement.md` — Frontend design refinement plan
- `docs/plans/2026-03-01-query-pipeline-fix.md` — Vector search config + entity hints fix
- `docs/plans/2026-03-01-archive-first-query.md` — Archive-first query with web fallback disclaimer

## API Endpoints

| Method | Path | Status |
|--------|------|--------|
| POST | `/ingest_pdf` | Phase 1+2+4 ✓ (OCR + graph + auto-classification) |
| GET | `/ingest_status/{job_id}` | Phase 1 ✓ |
| POST | `/query` | Phase 2+4 ✓ (parallel vector+graph + web fallback) |
| GET | `/document/signed_url` | Phase 1 ✓ |
| GET | `/graph/search?q=&limit=&categories=` | Phase 2 ✓ |
| GET | `/graph/{canonical_id}?categories=` | Phase 2 ✓ |
| GET | `/admin/documents` | Phase 5.3 ✓ (list ingested doc IDs) |
| GET | `/admin/documents/{doc_id}/ocr` | Phase 5.3 ✓ (OCR quality + flagged pages) |
| GET | `/health` | Phase 2 ✓ (includes Neo4j status) |

## Environment Setup

Copy `backend/.env.example` to `backend/.env` and fill in all `PLACEHOLDER_*` values. Required services: GCP (Document AI, Vertex AI Vector Search, Cloud Storage) + Neo4j AuraDB (free tier sufficient). Docker Compose mounts GCP credentials automatically.

## Neo4j AuraDB

- **URI**: configured in `.env` as `NEO4J_URI` (format: `neo4j+s://xxxxx.databases.neo4j.io`)
- **Free tier**: 200k nodes, 400k relationships — sufficient for ~100 docs
- **Pauses after 3 days of inactivity** — auto-resumes on connection
- **Node label**: `:Entity` with properties `canonical_id`, `name`, `main_categories`, `sub_category`, `aliases`, `attributes` (JSON string), `evidence_*` fields
- **Relationship label**: `:RELATED_TO` with `rel_type` property storing the semantic type (e.g. "ADMINISTERED")


## commit rule

never include by claude or equivalent in the commit message