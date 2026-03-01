"""Hybrid retrieval service for the Colonial Archives Graph-RAG backend.

Phase 2 implementation: parallel vector search + Neo4j graph traversal,
combined relevance scoring, and GraphPayload in the response.
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
from collections import defaultdict

from app.config.logging_config import log_stage
from app.config.settings import settings
from app.models.schemas import (
    ArchiveCitation,
    GraphEdge,
    GraphNode,
    GraphPayload,
    QueryResponse,
    WebCitation,
)
from app.services.embeddings import embeddings_service
from app.services.llm import llm_service
from app.services.neo4j_service import neo4j_service
from app.services.storage import storage_service
from app.services.vector_search import vector_search_service
from app.services.web_search import web_search_service

logger = logging.getLogger(__name__)

FALLBACK_ANSWER = "I cannot answer this based on the available sources."


class HybridRetrievalService:
    """Orchestrates vector search, graph traversal, and answer generation.

    Pipeline:
        1. Embed query
        2a. Vector search (parallel)
        2b. Graph traversal from entity hints (parallel)
        3. Merge + score results
        4. Generate answer via LLM
        5. Build response with citations and graph payload
    """

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def query(
        self,
        question: str,
        filter_categories: list[str] | None = None,
    ) -> QueryResponse:
        """Run the full hybrid-retrieval pipeline and return a QueryResponse."""

        # Step 1 — Embed the question.
        with log_stage("query_embed", logger=logger):
            query_embedding: list[float] = await embeddings_service.embed_query(question)

        # Step 1b — Extract entity hints from the question (simple keyword extraction).
        entity_hints = self._extract_entity_hints(question)
        logger.info("Entity hints from question: %s", entity_hints)

        # Step 2 — Parallel: vector search + graph traversal.
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

        # Handle exceptions from parallel tasks
        if isinstance(vector_results, BaseException):
            logger.warning("Vector search failed: %s", vector_results)
            vector_results = []
        if isinstance(graph_result, BaseException):
            logger.warning("Graph search failed: %s", graph_result)
            graph_result = {"payload": None, "context_chunks": []}

        # Step 3 — Early exit when there are no results.
        if not vector_results and not graph_result.get("context_chunks"):
            logger.info("No results for question; returning fallback")
            return QueryResponse(
                answer=FALLBACK_ANSWER,
                source_type="archive",
                citations=[],
                graph=None,
            )

        # Step 4 — Load chunk texts from GCS for vector results.
        vector_context: list[dict] = []
        if vector_results:
            vector_context = await self._load_chunk_contexts(vector_results)

        # Step 5 — Merge vector + graph context chunks, deduplicate.
        graph_context = graph_result.get("context_chunks", [])
        merged_context = self._merge_contexts(vector_context, graph_context)

        # Step 6 — Compute combined relevance score.
        vector_score = 0.0
        if vector_results:
            avg_distance = sum(r["distance"] for r in vector_results) / len(
                vector_results
            )
            vector_score = max(1.0 - avg_distance, 0.0)

        graph_hit_ratio = 0.0
        if entity_hints and graph_context:
            graph_hit_ratio = min(len(graph_context) / max(len(entity_hints), 1), 1.0)

        # Phase 2 combined scoring
        if graph_context:
            relevance_score = vector_score * 0.6 + graph_hit_ratio * 0.4
        else:
            relevance_score = vector_score

        logger.info(
            "Relevance: vector=%.4f, graph_ratio=%.4f, combined=%.4f",
            vector_score,
            graph_hit_ratio,
            relevance_score,
        )

        # Step 7 — Generate archive-only answer via LLM.
        with log_stage("llm_generation", logger=logger):
            llm_result: dict = await llm_service.generate_answer(
                question, merged_context, source_type="archive"
            )
        answer_text: str = llm_result["answer"]

        # Step 8 — If archive couldn't answer, try web fallback.
        web_context: list[dict] = []
        source_type = "archive"

        if answer_text.strip() == FALLBACK_ANSWER and merged_context:
            logger.info("Archive could not answer; triggering web fallback")
            try:
                web_context = await web_search_service.search(question)
                if web_context:
                    from app.services.llm import WEB_FALLBACK_PROMPT

                    web_llm_result = await llm_service.generate_answer(
                        question, web_context, source_type="web_fallback",
                        prompt_template=WEB_FALLBACK_PROMPT,
                    )
                    web_answer = web_llm_result["answer"]
                    disclaimer = (
                        "The requested information was not found in the colonial "
                        "archive documents. Below is an answer based on web sources:\n\n"
                    )
                    answer_text = disclaimer + web_answer
                    source_type = "web_fallback"
                    merged_context = web_context
                    logger.info("Web fallback answer generated")
            except Exception:
                logger.exception("Web fallback failed")

        # Step 9 — Build citation list (archive + web).
        citations: list[ArchiveCitation | WebCitation] = []
        archive_idx = 0
        web_idx = 0

        for chunk in merged_context:
            cite_type = chunk.get("cite_type", "archive")
            if cite_type == "web":
                web_idx += 1
                citations.append(
                    WebCitation(
                        id=web_idx,
                        title=chunk.get("title", ""),
                        url=chunk.get("url", ""),
                    )
                )
            else:
                archive_idx += 1
                text_span = chunk.get("text", "")
                if len(text_span) > 300:
                    text_span = text_span[:300]
                citations.append(
                    ArchiveCitation(
                        id=archive_idx,
                        doc_id=chunk.get("doc_id", ""),
                        pages=chunk.get("pages", []),
                        text_span=text_span,
                        confidence=chunk.get("confidence", 0.0),
                    )
                )

        # Step 10 — Build graph payload.
        graph_payload = graph_result.get("payload")

        return QueryResponse(
            answer=answer_text,
            source_type=source_type,
            citations=citations,
            graph=graph_payload,
        )

    # ------------------------------------------------------------------
    # Entity hint extraction
    # ------------------------------------------------------------------

    @staticmethod
    def _extract_entity_hints(question: str) -> list[str]:
        """Extract likely entity names from the question.

        Uses simple heuristics — capitalized multi-word phrases, proper
        nouns, and title-cased versions of multi-word sequences.
        No LLM call to keep latency low.
        """
        stop_words = {
            "what", "who", "where", "when", "how", "why", "which",
            "does", "did", "was", "were", "are", "is", "the", "and",
            "for", "with", "from", "about", "into", "that", "this",
            "have", "has", "had", "can", "could", "would", "should",
            "tell", "describe", "explain", "me", "please",
            "a", "an", "of", "in", "on", "to", "by",
        }

        # Find sequences of capitalized words (2+ words = likely entity)
        pattern = r"\b(?:[A-Z][a-z.]+(?:\s+[A-Z][a-z.]+)+)\b"

        # Try on original text first
        multi_word = re.findall(pattern, question)

        # Also try on title-cased text to catch lowercase queries
        title_q = question.title()
        title_multi = re.findall(pattern, title_q)

        # Merge, filtering out stop-word-only matches
        all_multi: list[str] = []
        for phrase in multi_word + title_multi:
            words = phrase.split()
            non_stop = [w for w in words if w.lower() not in stop_words]
            if non_stop:
                cleaned = " ".join(non_stop)
                if cleaned not in all_multi:
                    all_multi.append(cleaned)

        # Single capitalized words from original
        single_caps = re.findall(r"\b([A-Z][a-z]{2,})\b", question)
        single_caps = [w for w in single_caps if w.lower() not in stop_words]

        # Also from title-cased version
        title_singles = re.findall(r"\b([A-Z][a-z]{2,})\b", title_q)
        title_singles = [w for w in title_singles if w.lower() not in stop_words]

        all_singles = list(dict.fromkeys(single_caps + title_singles))

        # Combine: multi-word first, then singles not already covered
        hints: list[str] = list(all_multi)
        for word in all_singles:
            if not any(word.lower() in mw.lower() for mw in all_multi):
                hints.append(word)

        return hints

    # ------------------------------------------------------------------
    # Graph search
    # ------------------------------------------------------------------

    async def _graph_search(
        self,
        entity_hints: list[str],
        categories: list[str] | None,
    ) -> dict:
        """Search Neo4j for entities matching hints, return subgraph + context.

        Searches and subgraph fetches are parallelized via asyncio.gather.

        Returns a dict with ``payload`` (GraphPayload | None) and
        ``context_chunks`` (list of context dicts for LLM).
        """
        if not entity_hints:
            return {"payload": None, "context_chunks": []}

        # --- Phase 1: Search all entity hints in parallel ---
        search_results = await asyncio.gather(*[
            neo4j_service.search_entities(hint, limit=5, categories=categories)
            for hint in entity_hints
        ], return_exceptions=True)

        # Collect seeds for subgraph fetches
        seeds: list[GraphNode] = []
        for result in search_results:
            if isinstance(result, BaseException) or not result:
                continue
            seeds.append(result[0])

        if not seeds:
            return {"payload": None, "context_chunks": []}

        # --- Phase 2: Fetch all subgraphs in parallel ---
        subgraph_results = await asyncio.gather(*[
            neo4j_service.get_subgraph(seed.canonical_id, categories=categories)
            for seed in seeds
        ], return_exceptions=True)

        # --- Phase 3: Merge results ---
        all_nodes: dict[str, GraphNode] = {}
        all_edges: list[GraphEdge] = []
        context_chunks: list[dict] = []
        center_node: str | None = None

        for subgraph in subgraph_results:
            if isinstance(subgraph, BaseException) or subgraph is None:
                continue

            if center_node is None and subgraph.nodes:
                center_node = subgraph.nodes[0].canonical_id

            for node in subgraph.nodes:
                all_nodes[node.canonical_id] = node

            all_edges.extend(subgraph.edges)

            # Build context chunk from entity evidence for LLM grounding
            for node in subgraph.nodes:
                if node.highlighted:
                    context_chunks.append(
                        {
                            "id": node.canonical_id,
                            "text": f"Entity: {node.name}. "
                            + " ".join(
                                f"{k}: {v}" for k, v in node.attributes.items()
                            ),
                            "doc_id": "",
                            "pages": [],
                            "confidence": 0.8,
                            "cite_type": "archive",
                        }
                    )

        # Deduplicate edges
        seen_edges: set[str] = set()
        unique_edges: list[GraphEdge] = []
        for edge in all_edges:
            key = f"{edge.source}-{edge.type}-{edge.target}"
            if key not in seen_edges:
                seen_edges.add(key)
                unique_edges.append(edge)

        payload = None
        if all_nodes:
            payload = GraphPayload(
                nodes=list(all_nodes.values()),
                edges=unique_edges,
                center_node=center_node or "",
            )

        return {"payload": payload, "context_chunks": context_chunks}

    # ------------------------------------------------------------------
    # Context merging
    # ------------------------------------------------------------------

    @staticmethod
    def _merge_contexts(
        vector_context: list[dict],
        graph_context: list[dict],
    ) -> list[dict]:
        """Merge vector and graph context chunks, deduplicating by id."""
        seen_ids: set[str] = set()
        merged: list[dict] = []

        # Vector results take priority
        for chunk in vector_context:
            cid = chunk.get("id", "")
            if cid not in seen_ids:
                seen_ids.add(cid)
                merged.append(chunk)

        for chunk in graph_context:
            cid = chunk.get("id", "")
            if cid not in seen_ids:
                seen_ids.add(cid)
                merged.append(chunk)

        return merged

    # ------------------------------------------------------------------
    # GCS chunk loading (unchanged from Phase 1)
    # ------------------------------------------------------------------

    async def _load_chunk_contexts(
        self,
        vector_results: list[dict],
    ) -> list[dict]:
        """Load full chunk texts from GCS and merge with vector distances.

        Downloads are parallelized via asyncio.gather + run_in_executor.
        """

        distance_by_chunk: dict[str, float] = {
            r["id"]: r["distance"] for r in vector_results
        }

        doc_chunks: dict[str, list[str]] = defaultdict(list)
        for chunk_id in distance_by_chunk:
            parts = chunk_id.split("_chunk_", 1)
            doc_id = parts[0] if len(parts) == 2 else chunk_id
            doc_chunks[doc_id].append(chunk_id)

        # --- Parallel GCS downloads ---
        async def _download(doc_id: str) -> tuple[str, list[dict]]:
            blob_path = f"chunks/{doc_id}.json"
            try:
                blob = storage_service._bucket.blob(blob_path)
                loop = asyncio.get_event_loop()
                raw_text = await loop.run_in_executor(None, blob.download_as_text)
                return doc_id, json.loads(raw_text)
            except Exception:
                logger.warning(
                    "Failed to load chunk file from GCS: %s",
                    blob_path,
                    exc_info=True,
                )
                return doc_id, []

        results = await asyncio.gather(*[
            _download(doc_id) for doc_id in doc_chunks
        ])

        chunk_lookup: dict[str, dict] = {}
        for _doc_id, chunks_data in results:
            for chunk in chunks_data:
                cid = chunk.get("chunk_id", "")
                if cid in distance_by_chunk:
                    chunk_lookup[cid] = chunk

        # --- Build context list ---
        context_chunks: list[dict] = []
        for chunk_id, distance in distance_by_chunk.items():
            stored = chunk_lookup.get(chunk_id, {})
            parts = chunk_id.split("_chunk_", 1)
            doc_id = parts[0] if len(parts) == 2 else chunk_id

            context_chunks.append(
                {
                    "id": chunk_id,
                    "text": stored.get("text", ""),
                    "doc_id": doc_id,
                    "pages": stored.get("pages", []),
                    "confidence": distance,
                    "cite_type": "archive",
                }
            )

        context_chunks.sort(key=lambda c: c["confidence"], reverse=True)

        logger.info(
            "Loaded %d / %d chunk contexts from GCS",
            len(chunk_lookup),
            len(distance_by_chunk),
        )
        return context_chunks


# Module-level singleton
hybrid_retrieval_service = HybridRetrievalService()
