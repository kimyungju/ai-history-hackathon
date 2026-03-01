# Colonial Archives Graph-RAG

Source-grounded Q&A over colonial-era archive documents, powered by a knowledge graph and retrieval-augmented generation. Every answer traces back to specific document pages — zero tolerance for hallucination.

![Python](https://img.shields.io/badge/Python-3.11+-blue)
![React](https://img.shields.io/badge/React-19-61DAFB)
![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688)
![Neo4j](https://img.shields.io/badge/Neo4j-AuraDB-008CC1)

## Overview

Colonial Archives Graph-RAG is an AI-powered research tool for querying colonial-era handwritten archive documents (English and Chinese) via a chatbot backed by a knowledge graph. The system ingests scanned PDFs through OCR, builds a knowledge graph of entities and relationships, and provides a conversational interface for researchers to explore the archives.

**Key capabilities:**

- **Archive-first retrieval** — parallel vector search + graph traversal, with LLM answers generated strictly from archive context
- **Web fallback with disclaimer** — only when the archive cannot answer, clearly marked
- **Interactive knowledge graph** — two-state visualization (full overview and query-filtered), with category coloring and node sizing by connectivity
- **Source traceability** — click any graph node to view the original PDF page
- **Full document retrieval** — request specific pages or page ranges from any ingested document

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
# Backend (54 tests)
cd backend
python -m pytest tests/ -v

# Frontend (33 tests)
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
└── tests/

frontend/
├── src/
│   ├── App.tsx
│   ├── api/client.ts
│   ├── components/
│   │   ├── ChatPanel.tsx
│   │   ├── GraphCanvas.tsx
│   │   ├── GraphSearchBar.tsx
│   │   ├── NodeSidebar.tsx
│   │   ├── PdfModal.tsx
│   │   └── AdminPanel.tsx
│   ├── stores/useAppStore.ts
│   └── types/index.ts
└── package.json

infra/
└── docker-compose.yml
```
