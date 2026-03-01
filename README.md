# Colonial Archives Graph-RAG

Source-grounded Q&A over colonial-era archive documents, powered by a knowledge graph and retrieval-augmented generation. Every answer traces back to specific document pages — zero tolerance for hallucination.

![Python](https://img.shields.io/badge/Python-3.11+-blue)
![React](https://img.shields.io/badge/React-19-61DAFB)
![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688)
![Neo4j](https://img.shields.io/badge/Neo4j-AuraDB-008CC1)

---

## Hackathon Objectives

This project addresses all three objectives of the CO 273 Pipeline challenge, plus the bonus task.

### Objective 1: High-Fidelity OCR & Correction

We use **Google Cloud Document AI** to produce accurate text from colonial-era scanned PDFs — far surpassing the legacy Gale OCR.

| Capability | Implementation |
|---|---|
| **OCR engine** | Google Cloud Document AI |
| **Batch processing** | 15-page batches with semaphore concurrency (5 parallel requests) |
| **Text cleaning** | Sliding-window chunking (450 tokens, 100 overlap), CJK language detection |
| **Quality monitoring** | Per-page confidence scores; pages below 0.5 flagged for review |
| **Scale** | **28 PDFs ingested** from CO 273 series (volumes 534, 550, 579) — architecture handles the full collection |

The 9-step ingestion pipeline (PDF → OCR → chunk → embed → vector upsert → entity extraction → normalization → Neo4j MERGE → auto-classification) runs end-to-end, tested with real colonial archive data.

> **Key files:** [`backend/app/services/ocr.py`](backend/app/services/ocr.py), [`backend/app/services/chunking.py`](backend/app/services/chunking.py), [`backend/app/routers/ingest.py`](backend/app/routers/ingest.py)
>
> **Design docs:** [`docs/plans/2026-03-01-phase1-backend-foundation.md`](docs/plans/2026-03-01-phase1-backend-foundation.md), [`docs/plans/2026-03-01-data-ingestion-and-integration.md`](docs/plans/2026-03-01-data-ingestion-and-integration.md)

---

### Objective 2: The "Kratoska Link" (Re-indexing)

We go beyond keyword indexing by building a **full knowledge graph** of entities and relationships extracted from the archive text, enabling researchers to discover connections between people, places, events, and institutions across the entire CO 273 collection.

| Capability | Implementation |
|---|---|
| **Entity extraction** | Gemini 2.0 Flash structured JSON output per chunk |
| **Entity normalization** | Three-stage dedup: exact match → embedding similarity (0.85 threshold) → fuzzy string (rapidfuzz) |
| **Graph database** | Neo4j AuraDB with idempotent MERGE (re-ingestion safe) |
| **Entity search** | `GET /graph/search?q=Opium` — find entities with word-split fallback |
| **Subgraph traversal** | 1–3 hop Cypher queries from seed entities, filtered by category |
| **Category classification** | 5 predefined archive categories (General, Economic, Social, Internal, Defence) + Gemini auto-classification |
| **Source traceability** | Every entity stores `evidence_doc_id`, `evidence_page`, `evidence_text_span` — click any node to view the original PDF page |

**Data at scale:** 1,463 entities, 6,843 relationships extracted from 28 PDFs, all 100% traceable to source pages.

The interactive **two-state knowledge graph** (Cytoscape.js + fcose layout) lets researchers visually explore the full archive on load, then see query-relevant subgraphs after asking a question. Nodes are sized by connection count, colored by category, and clickable — opening the source document at the exact evidence page.

> **Key files:** [`backend/app/services/entity_extraction.py`](backend/app/services/entity_extraction.py), [`backend/app/services/entity_normalization.py`](backend/app/services/entity_normalization.py), [`backend/app/services/neo4j_service.py`](backend/app/services/neo4j_service.py), [`frontend/src/components/GraphCanvas.tsx`](frontend/src/components/GraphCanvas.tsx)
>
> **Design docs:** [`docs/plans/2026-03-01-colonial-archives-graph-rag-design.md`](docs/plans/2026-03-01-colonial-archives-graph-rag-design.md), [`docs/plans/2026-03-02-graph-visualization-overhaul.md`](docs/plans/2026-03-02-graph-visualization-overhaul.md)

---

### Objective 3: The Semantic Historian (RAG & Summarization)

The chatbot uses an **archive-first retrieval pipeline** — answers are generated strictly from colonial documents, with web fallback only when the archive cannot answer (clearly marked with a disclaimer).

| Capability | Implementation |
|---|---|
| **Hybrid retrieval** | Parallel vector search (Vertex AI Vector Search, text-embedding-004) + graph traversal (Neo4j) |
| **LLM generation** | Gemini 2.0 Flash, temperature 0.1, archive-only prompt |
| **Citation system** | `[archive:N]` markers → clickable badges → PDF viewer at exact source page |
| **Web fallback** | Tavily search, triggered only when archive LLM returns fallback — prefixed with disclaimer |
| **Full-doc retrieval** | "Show me CO 273/550/18" → bypasses vector search, fetches full OCR text directly |
| **Scoring** | `(1 - cosine_distance) * 0.6 + graph_hit_ratio * 0.4` — archive context ranked by relevance |
| **Category filtering** | Optional multi-select filter restricts search to specific archive categories |

**No LangChain or LlamaIndex** — all retrieval orchestration uses direct SDK calls for full traceability and control. Every answer includes numbered citations linking back to specific document pages, viewable in an in-browser PDF viewer (pdf.js with signed URLs).

> **Key files:** [`backend/app/services/hybrid_retrieval.py`](backend/app/services/hybrid_retrieval.py), [`backend/app/services/llm.py`](backend/app/services/llm.py), [`backend/app/services/vector_search.py`](backend/app/services/vector_search.py), [`frontend/src/components/ChatPanel.tsx`](frontend/src/components/ChatPanel.tsx), [`frontend/src/components/PdfModal.tsx`](frontend/src/components/PdfModal.tsx)
>
> **Design docs:** [`docs/plans/2026-03-01-archive-first-query.md`](docs/plans/2026-03-01-archive-first-query.md), [`docs/plans/2026-03-01-query-pipeline-fix.md`](docs/plans/2026-03-01-query-pipeline-fix.md), [`docs/plans/2026-03-02-full-document-retrieval.md`](docs/plans/2026-03-02-full-document-retrieval.md)

---

### Bonus: Commodities and Capitalism

We started by broadly classifying all ingested documents into five thematic categories aligned with the hackathon themes — visible as the color-coded legend in the knowledge graph:

| Category | Theme Mapping | Data Share |
|---|---|---|
| **Economic and Financial** | Commodities and Capitalism | ~70% |
| **General and Establishment** | Colonialism, Race and Politics | ~30% (combined across 4 themes) |
| **Social Services** | Gender and Sexuality | |
| **Internal Relations and Research** | Popular Culture | |
| **Defence and Military** | Ecology and Other Animals | |

From this broad classification, we specialized — **70% of our data comes from the theme of Commodities and Capitalism**, with 30% drawn from the other four themes. This concentration reflects the CO 273 collection's heavy focus on trade, revenue, and economic administration in the Straits Settlements.

Our specialization is supported by secondary source ingestion: we incorporated Trocki's *Opium and Empire* and Huff's *The Economic Growth of Singapore* (see [`document_categories.json`](backend/app/config/document_categories.json)) alongside the primary CO 273 correspondence, enabling the chatbot to contextualize colonial economic documents against modern historiography.

**What researchers can do:**

- **Filter by category** — the graph legend toggles category visibility, letting researchers isolate Economic/Financial nodes to explore trade networks, opium revenue, port administration
- **Explore entity connections** — the graph reveals cross-document relationships (e.g., opium trade networks linking merchants, ports, and policies across volumes)
- **Trace evidence chains** — every entity and relationship is source-grounded, enabling historians to verify AI-discovered connections against the original handwritten documents
- **Visual cluster analysis** — the fcose-clustered overview graph shows thematic groupings by color, revealing structural patterns in the colonial correspondence

The warm archival design theme (Crimson Pro typography, stone/ink color palette, Merlion logo) was chosen to respect the historical character of the material while providing a modern research interface.

> **Key files:** [`backend/app/config/document_categories.json`](backend/app/config/document_categories.json), [`backend/app/services/auto_classification.py`](backend/app/services/auto_classification.py)
>
> **Design docs:** [`docs/plans/2026-03-01-frontend-design-refinement.md`](docs/plans/2026-03-01-frontend-design-refinement.md), [`docs/plans/2026-03-02-node-source-document-link.md`](docs/plans/2026-03-02-node-source-document-link.md)

---

## Architecture

```
┌─────────────┐     ┌──────────────────────────────────────────────┐
│   React UI  │────▶│  FastAPI Backend                             │
│  Cytoscape  │     │                                              │
│  PDF.js     │     │  ┌─────────┐  ┌──────────┐  ┌────────────┐  │
│  Zustand    │     │  │ Vertex  │  │  Neo4j   │  │ Document   │  │
└─────────────┘     │  │ AI Vec  │  │ AuraDB   │  │ AI OCR     │  │
                    │  │ Search  │  │ (Graph)  │  │            │  │
                    │  └─────────┘  └──────────┘  └────────────┘  │
                    │  ┌─────────┐  ┌──────────┐  ┌────────────┐  │
                    │  │ Gemini  │  │  Cloud   │  │  Tavily    │  │
                    │  │ 2.0     │  │  Storage │  │  (Web)     │  │
                    │  │ Flash   │  │  (GCS)   │  │            │  │
                    │  └─────────┘  └──────────┘  └────────────┘  │
                    └──────────────────────────────────────────────┘
```

**Stack:** FastAPI (Python 3.11) · React 19 · TypeScript · Cytoscape.js · Tailwind CSS · Google Cloud (Document AI, Vertex AI, Cloud Storage, Vector Search) · Neo4j AuraDB · Gemini 2.0 Flash

No LangChain or LlamaIndex — direct SDK calls for full traceability and control.

## Data Pipeline

The ingestion pipeline processes archive PDFs in 9 steps:

1. **PDF upload** — from Google Cloud Storage
2. **OCR** — Document AI with page batching (15/batch) and semaphore concurrency
3. **Text cleaning + chunking** — sliding window (450 tokens, 100 overlap), CJK language detection
4. **Embedding** — Vertex AI `text-embedding-004`, batch size 250
5. **Vector upsert** — Vertex AI Vector Search
6. **Entity extraction** — Gemini structured JSON output per chunk
7. **Entity normalization** — three-stage dedup (exact, embedding similarity, fuzzy string)
8. **Graph MERGE** — idempotent upsert into Neo4j
9. **Auto-classification** — Gemini-based category assignment for unmapped PDFs

Steps 7–9 (graph) are non-blocking — vector ingestion succeeds even if the graph pipeline fails.

## Getting Started

### Prerequisites

- Python 3.11+
- Node.js 18+
- GCP project with Document AI, Vertex AI, Cloud Storage enabled
- Neo4j AuraDB instance (free tier sufficient)
- [Tavily API key](https://tavily.com) (for web search fallback)

### Environment Setup

```bash
cp backend/.env.example backend/.env
# Fill in all PLACEHOLDER_* values
```

Required environment variables:

| Variable | Description |
|----------|-------------|
| `GCP_PROJECT_ID` | Google Cloud project ID |
| `GCP_REGION` | Primary region (e.g. `asia-southeast1`) |
| `DOC_AI_PROCESSOR_ID` | Document AI OCR processor ID |
| `CLOUD_STORAGE_BUCKET` | GCS bucket containing archive PDFs |
| `VECTOR_SEARCH_ENDPOINT` | Vertex AI Vector Search endpoint |
| `VECTOR_SEARCH_INDEX_ID` | Vector Search index ID |
| `VECTOR_SEARCH_DEPLOYED_INDEX_ID` | Deployed index ID |
| `NEO4J_URI` | Neo4j connection URI (`neo4j+s://...`) |
| `NEO4J_USER` | Neo4j username |
| `NEO4J_PASSWORD` | Neo4j password |
| `TAVILY_API_KEY` | Tavily web search API key |

### Running Locally

**Backend:**

```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8080
# Swagger docs at http://localhost:8080/docs
```

**Frontend:**

```bash
cd frontend
npm install
npm run dev
```

### Running with Docker

```bash
cd infra
docker-compose up --build
# Requires GCP credentials — see backend/.env.example
```

## API

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/ingest_pdf` | Ingest a PDF (OCR + graph + classification) |
| `GET` | `/ingest_status/{job_id}` | Check ingestion job status |
| `POST` | `/query` | Ask a question (archive-first + web fallback) |
| `GET` | `/document/signed_url` | Get a signed URL for a source PDF |
| `GET` | `/document/{doc_id}/text` | Get OCR text for specific pages |
| `GET` | `/graph/overview` | Full knowledge graph (5-min cache) |
| `GET` | `/graph/search` | Search entities by name |
| `GET` | `/graph/{canonical_id}` | Get subgraph for an entity |
| `GET` | `/admin/documents` | List ingested documents |
| `GET` | `/admin/documents/{doc_id}/ocr` | OCR quality report |
| `GET` | `/health` | Health check (includes Neo4j status) |

## Testing

```bash
# Backend (85 tests)
cd backend
python -m pytest tests/ -v

# Frontend (45 tests)
cd frontend
npx vitest run
```

## Project Structure

```
backend/
├── app/
│   ├── main.py              # FastAPI app, lifespan, CORS
│   ├── config/
│   │   ├── settings.py      # Pydantic Settings from .env
│   │   └── document_categories.json
│   ├── models/
│   │   └── schemas.py       # All Pydantic v2 models
│   ├── routers/             # Thin HTTP layer
│   │   ├── ingest.py
│   │   ├── query.py
│   │   ├── graph.py
│   │   └── admin.py
│   └── services/            # Business logic
│       ├── ocr.py
│       ├── chunking.py
│       ├── embeddings.py
│       ├── vector_search.py
│       ├── llm.py
│       ├── entity_extraction.py
│       ├── entity_normalization.py
│       ├── neo4j_service.py
│       ├── hybrid_retrieval.py
│       ├── web_search.py
│       └── storage.py
├── tests/
docs/
└── plans/                   # Design documents and implementation plans
dev/
└── active/                  # Multi-phase team context (plan + tasks per phase)
frontend/
├── src/
│   ├── App.tsx
│   ├── api/client.ts
│   ├── components/
│   │   ├── ChatPanel.tsx
│   │   ├── GraphCanvas.tsx
│   │   ├── GraphLegend.tsx
│   │   ├── NodeSidebar.tsx
│   │   ├── PdfModal.tsx
│   │   └── AdminPanel.tsx
│   ├── stores/useAppStore.ts
│   └── types/index.ts
└── package.json
infra/
└── docker-compose.yml
```

## Documentation

Detailed design documents and implementation plans are available in `docs/plans/`:

| Document | Description |
|----------|-------------|
| [`colonial-archives-graph-rag-design.md`](docs/plans/2026-03-01-colonial-archives-graph-rag-design.md) | Overall system architecture and design decisions |
| [`phase1-backend-foundation.md`](docs/plans/2026-03-01-phase1-backend-foundation.md) | Backend foundation: OCR, chunking, embeddings, vector search |
| [`data-ingestion-and-integration.md`](docs/plans/2026-03-01-data-ingestion-and-integration.md) | End-to-end ingestion pipeline with Neo4j integration |
| [`phase3-implementation-plan.md`](docs/plans/2026-03-01-phase3-implementation-plan.md) | React frontend: graph visualization, chat, PDF viewer |
| [`phase4-web-augmentation.md`](docs/plans/2026-03-01-phase4-web-augmentation.md) | Web fallback, auto-classification, category filtering |
| [`archive-first-query.md`](docs/plans/2026-03-01-archive-first-query.md) | Archive-first query pipeline with web fallback disclaimer |
| [`graph-visualization-overhaul.md`](docs/plans/2026-03-02-graph-visualization-overhaul.md) | Two-state graph: overview (fcose-clustered) + query-filtered |
| [`full-document-retrieval.md`](docs/plans/2026-03-02-full-document-retrieval.md) | Multi-page document retrieval by reference |
| [`future-roadmap.md`](docs/plans/future-roadmap.md) | Future enhancements and scaling plans |

Multi-phase team execution contexts are available in `dev/active/` with per-phase plan, task breakdown, and architecture context documents.
