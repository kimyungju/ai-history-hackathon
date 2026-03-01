# Colonial Archives Graph-RAG

## 1. Overview & Motivation

Colonial-era archives — handwritten ledgers, multilingual correspondence, administrative records from the Straits Settlements — contain centuries of Southeast Asian history. But they are nearly inaccessible. The documents sit in digitized PDFs with no searchable text. A researcher looking for references to a specific colonial officer or trade regulation must manually page through hundreds of scanned images, hoping to recognize faded cursive or classical Chinese characters.

Colonial Archives Graph-RAG closes that gap. It is a full-stack AI research tool that ingests scanned archival PDFs through a nine-step pipeline — OCR, chunking, embedding, vector indexing, entity extraction, normalization, and knowledge graph construction — and exposes them through a chatbot backed by a knowledge graph. Researchers type natural-language questions and receive answers grounded exclusively in the archive documents, with every claim linked to a specific document page. Clicking a citation opens the original PDF at the exact page.

The system targets historians, archival researchers, and NUS students working with the CO 273 series (Colonial Office correspondence for the Straits Settlements). It currently holds 1,463 entities extracted from 28 PDFs with 6,843 relationships, all 100% traceable to source documents.

This project exists at the intersection of a real research tool and a systems engineering demonstration. The archive-first retrieval architecture, the three-stage entity deduplication pipeline, and the two-state knowledge graph visualization each solve constraints specific to working with messy, century-old handwritten documents. Every architectural decision described below was made to serve both goals: ship something researchers actually use, and build something worth examining.

## 2. Technical Architecture & Workflow

### System Overview

```
                          ┌──────────────────┐
                          │  Cloud Storage   │
                          │  (GCS — PDFs,    │
                          │   OCR, chunks)   │
                          └────────┬─────────┘
                                   │
┌──────────────────┐  REST API   ┌─┴──────────────────────────┐  External APIs
│  React 19        │<==========> │  FastAPI Backend            │ ==========>
│  + Vite          │  /query     │                             │  Document AI
│                  │  /ingest    │  - Hybrid Retrieval         │  (OCR)
│  - Cytoscape     │  /graph/*   │    (vector + graph)         │  Vertex AI
│    Knowledge     │  /document  │  - Entity Normalization     │  (embeddings,
│    Graph (fcose) │             │    (3-stage dedup)           │   vector search,
│  - Chat +        │  JSON +     │  - OCR Pipeline             │   Gemini LLM)
│    Citations     │  GraphPayload│   (adaptive batching)      │
│  - PDF Viewer    │  + citations │                             │  Tavily
│  - Zustand       │  + signed URLs                            │  (web fallback)
└──────────────────┘             └──────────────┬──────────────┘
                                                │
                                      ┌─────────┴─────────┐
                                      │  Neo4j AuraDB      │
                                      │  Knowledge Graph   │
                                      │  1,463 entities    │
                                      │  6,843 edges       │
                                      └────────────────────┘
```

### Ingestion & Query Pipelines

**Ingestion** follows a nine-step pipeline: PDF download from GCS → Document AI OCR (batched, with retry) → text cleaning and sliding-window chunking with page-span tracking → Vertex AI embedding → vector index upsert → entity extraction via Gemini structured JSON → three-stage entity normalization → Neo4j MERGE. Steps 7–9 (graph construction) are non-blocking — vector ingestion succeeds even if the graph database is temporarily unavailable.

**Query** follows an archive-first strategy. The question is embedded and entity hints are extracted via regex (no LLM call, keeping latency low). Vector search and Neo4j graph traversal run in parallel with independent timeouts. Failures in one path do not block the other:

```python
# hybrid_retrieval.py — parallel search with fault isolation
async def _timed_vector():
    with log_stage("vector_search", logger=logger):
        return await vector_search_service.search(
            query_embedding, filter_categories=filter_categories
        )

async def _timed_graph():
    with log_stage("graph_search", logger=logger):
        return await self._graph_search(entity_hints, filter_categories)

vector_results, graph_result = await asyncio.gather(
    asyncio.wait_for(_timed_vector(), timeout=30),
    asyncio.wait_for(_timed_graph(), timeout=15),
    return_exceptions=True,
)

if isinstance(vector_results, BaseException):
    logger.warning("Vector search failed: %s", vector_results)
    vector_results = []
```

Results are merged, scored (vector similarity × 0.6 + graph hit ratio × 0.4), and fed to Gemini 2.0 Flash with an archive-only prompt. The LLM generates an answer with `[archive:N]` citations. If the archive cannot answer, a web search fallback triggers via Tavily with a disclaimer prefix — the system never presents web-sourced information as archival fact.

### Data Model

The backend uses no ORM. All services are module-level singletons with lazy initialization — GCP SDK clients are deferred to first use because `vertexai.init()` runs in the FastAPI lifespan, after imports. Neo4j writes use `MERGE` exclusively (never `CREATE`) so re-ingesting a document updates existing entities and relationships without creating duplicates.

## 3. Tech Stack Deep Dive

| Technology | Role | Why Over Alternatives | Tradeoff |
|---|---|---|---|
| **FastAPI + Python 3.11** | Backend framework | Native async, Pydantic v2 validation, auto-generated Swagger docs. Direct SDK access to all GCP services without wrapper overhead | GIL limits CPU parallelism; mitigated with `run_in_executor` for blocking SDK calls |
| **Vertex AI (Embeddings + Vector Search + Gemini)** | AI pipeline | Single-vendor for embeddings (`text-embedding-004`), nearest-neighbor search, and LLM generation. Eliminates cross-vendor auth complexity | Vendor lock-in to GCP; Gemini only available in `us-central1`, requiring dual-region architecture |
| **Neo4j AuraDB** | Knowledge graph | Native graph queries for multi-hop traversal (3 hops deep). Free tier sufficient for 200k nodes | Pauses after 3 days of inactivity — cold-start requires 30–60s and retry logic |
| **React 19 + Cytoscape.js** | Frontend + graph visualization | Cytoscape handles 1,400+ node rendering with fcose physics layout. React 19 concurrent features for smooth graph + chat interaction | Cytoscape's imperative API requires careful lifecycle management inside React's declarative model |
| **Zustand** | State management | ~2KB, no boilerplate. Single store with selector pattern avoids unnecessary re-renders across graph, chat, and modal state | No middleware ecosystem; devtools less mature than Redux |
| **Direct GCP SDKs (no LangChain)** | Service integration | Full control over prompts, retry logic, and citation tracking. Every generated answer traces back to specific vector chunks and graph entities | More code to maintain; no community plugins for common patterns |

### Design System

The UI uses a warm archival aesthetic: Crimson Pro (serif) for display headings, Plus Jakarta Sans for body text, and IBM Plex Mono for citations and document IDs. The dark theme uses warm stone grays with a gold accent palette (`ink-*`) — deliberately chosen to evoke aged paper and ink rather than the cold blue-gray of typical dashboards.

## 4. Technical Challenges & Solutions

### Challenge 1: Three-Stage Entity Normalization

**Constraint:** OCR of century-old handwritten documents produces spelling variants. The same colonial officer appears as "Raffles", "T. Raffles", "Raffels" (OCR error), and "Sir Thomas Stamford Raffles" across different pages. Without deduplication, the knowledge graph fills with ghost nodes representing the same person.

**Why naive exact matching fails:** Case-insensitive string comparison catches "raffles" vs "Raffles" but misses abbreviations ("T. Raffles"), OCR errors ("Raffels"), and name expansions. A single matching strategy cannot handle all three variant types.

**Solution:** A three-stage matching pipeline where each stage catches what the previous one missed:

```python
# entity_normalization.py — three-stage entity matching
async def _find_match(self, entity, existing_entities,
                      entity_embedding, existing_names, existing_embeddings):
    name_lower = entity.name.lower().strip()

    # Stage 1: Exact name/alias match (handles case + known aliases)
    for existing in existing_entities:
        if existing["name"].lower().strip() == name_lower:
            return existing
        for alias in existing.get("aliases", []):
            if alias.lower().strip() == name_lower:
                return existing

    # Stage 2: Embedding similarity (handles abbreviations, expansions)
    best_sim, best_idx = 0.0, -1
    for i, existing_emb in enumerate(existing_embeddings):
        sim = self._cosine_similarity(entity_embedding, existing_emb)
        if sim > best_sim:
            best_sim, best_idx = sim, i
    if best_sim >= settings.ENTITY_SIMILARITY_THRESHOLD:  # 0.85
        return existing_entities[best_idx]

    # Stage 3: Fuzzy string match (handles OCR spelling errors)
    best_fuzzy, best_fuzzy_idx = 0.0, -1
    for i, existing in enumerate(existing_entities):
        candidates = [existing["name"]] + existing.get("aliases", [])
        for candidate in candidates:
            score = fuzz.token_sort_ratio(name_lower, candidate.lower()) / 100.0
            if score > best_fuzzy:
                best_fuzzy, best_fuzzy_idx = score, i
    if best_fuzzy >= settings.ENTITY_SIMILARITY_THRESHOLD:
        return existing_entities[best_fuzzy_idx]

    return None  # Genuinely new entity
```

Entities extracted within the same batch can also match each other — the normalized entity is immediately added to the existing pool, preventing duplicate new nodes from a single ingestion run. The 0.85 similarity threshold was tuned empirically: lower values over-merge distinct entities (e.g. "Singapore" and "Singapura" are correctly merged, but "Singapore" and "Penang" stay separate).

**Tradeoff:** Stage 2 requires embedding every entity name via Vertex AI, adding ~2s per batch of 50 entities. For 28 documents this is acceptable. At 1,000+ documents, the embedding cost would require caching or a local model.

### Challenge 2: OCR Adaptive Batching Under API Constraints

**Constraint:** Google Document AI's synchronous endpoint enforces a 15-page-per-request limit and rejects inline documents larger than 40 MB. A typical colonial archive PDF contains 50–200 pages and can exceed 100 MB. Submitting all batches concurrently exhausts API quotas within seconds.

**Why fixed concurrency fails:** Running 5 parallel batches works for a 75-page document but causes `RESOURCE_EXHAUSTED` errors on a 200-page one (13+ simultaneous requests). Running 1 batch at a time is safe but makes a 200-page document take 10+ minutes.

**Solution:** Adaptive concurrency that scales with document size, combined with a semaphore and progress tracking:

```python
# ocr.py — adaptive concurrency with progress tracking
if total_pages > 200:
    concurrency = 1
elif total_pages > 100:
    concurrency = 2
else:
    concurrency = 5

semaphore = asyncio.Semaphore(concurrency)
completed_count = 0
completed_lock = asyncio.Lock()

async def _limited(coro, batch_num: int):
    nonlocal completed_count
    async with semaphore:
        result = await coro
        async with completed_lock:
            completed_count += 1
            logger.info("[%s] OCR batch %d/%d complete (%d/%d done)",
                        doc_id, batch_num, total_batches,
                        completed_count, total_batches)
        return result
```

For oversized PDFs (> 40 MB), the service physically splits the file into sub-PDFs using pypdf before sending each batch. Each Document AI call is wrapped with retry logic — up to 3 attempts with exponential backoff (2s, 4s, 8s) on `429 RESOURCE_EXHAUSTED`. Response objects are explicitly deleted after parsing to free memory.

**Tradeoff:** The concurrency thresholds (200/100 pages) are manually tuned for the current GCP quota tier. A production deployment with higher quotas would need different thresholds or dynamic adjustment based on error rates.

### Challenge 3: Two-State Knowledge Graph at Scale

**Constraint:** The knowledge graph contains 1,463 entities with 6,843 edges. Rendering all of them simultaneously in a browser produces an unreadable hairball. But showing only query-relevant entities (10–50 nodes) loses the full-graph exploration capability researchers need.

**Why a single layout mode fails:** A layout tuned for 1,400 nodes (high repulsion, wide spacing) produces an overly sparse view for 20-node query results. Parameters tuned for small subgraphs cause massive overlap at scale.

**Solution:** A two-state visualization with mode-aware fcose physics parameters:

```typescript
// GraphCanvas.tsx — mode-aware layout parameters
const layoutOptions = isOverviewMode
  ? {
      name: "fcose",
      quality: "proof",
      nodeSeparation: 250,
      gravity: 0.08,
      numIter: 5000,
      idealEdgeLength: (edge) => {
        const src = edge.source().data("main_categories");
        const tgt = edge.target().data("main_categories");
        return src === tgt ? 180 : 450;  // Cluster by category
      },
      nodeRepulsion: (node) => {
        const cc = node.data("connection_count");
        if (cc > 10) return 80000;  // Push hubs apart
        if (cc > 3) return 40000;
        return 20000;
      },
    }
  : {
      name: "fcose",
      nodeSeparation: 100,
      gravity: 0.25,                    // Tighter clustering
      idealEdgeLength: (edge) => {
        /* same-category: 100, cross: 200 */
      },
      nodeRepulsion: (node) => {
        return node.data("connection_count") > 5 ? 10000 : 5000;
      },
    };
```

The overview graph loads on page mount with a 5-minute cache. Nodes with zero connections are filtered from the overview to reduce visual noise. Node sizes scale with `sqrt(connection_count)` (20–70px overview, 16–50px query), and labels are shown only for the top 40% of nodes by connection count to prevent label overlap. Hub nodes (8+ connections) receive colored borders matching their category. After any query, the graph switches to query mode showing only the relevant subgraph, with a "Show Full Graph" button to return to the overview.

**Tradeoff:** The overview uses "proof" quality layout with 5,000 iterations, which takes 2–3 seconds on first render. This is acceptable for an initial load but would not work for real-time graph updates.

## 5. Impact & Future Roadmap

### Current State

- End-to-end pipeline processing 28 colonial archive PDFs into a searchable knowledge graph with 1,463 entities and 6,843 relationships
- Archive-first retrieval with page-level citations — every answer traces to a specific document page, with clickable citations that open the original PDF
- Two-state knowledge graph visualization with category-based clustering, interactive node inspection, and source document links
- 130 tests (85 backend + 45 frontend) covering retrieval orchestration, citation parsing, entity normalization, and API contracts

### Scalability Considerations

- Entity normalization embedding cost scales linearly with entity count — at 10,000+ entities, pre-computed embedding caches or approximate nearest-neighbor indexes would replace the current pairwise comparison
- Neo4j AuraDB free tier supports 200k nodes — the current 1,463 entities leave substantial headroom, but a production deployment with 1,000+ documents would require a paid tier with always-on availability
- Vector Search index supports incremental upserts without reindexing, enabling continuous ingestion without downtime

### Planned Features

- **PDF loading performance** — cache `PDFDocumentProxy` objects by document ID so reopening a previously viewed PDF is instant, add HTTP Range request support for partial downloads, and cache signed URLs to avoid redundant GCS round-trips
- **Cloud Run deployment** — CI/CD pipeline (Cloud Build) is configured with lint, test, build, and push stages. Backend and frontend deploy as separate Cloud Run services with secrets from Secret Manager

The architecture is designed for this kind of extension: each service — OCR, embedding, graph, retrieval — operates as an independent module with a singleton interface. Replacing the OCR provider, swapping the vector store, or adding a new LLM requires changes in a single service file without cascading rewrites.
