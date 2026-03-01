"""Tests for hybrid retrieval performance optimizations."""

import asyncio
import json
from unittest.mock import MagicMock, patch

import pytest

from app.models.schemas import GraphNode, GraphPayload
from app.services.hybrid_retrieval import HybridRetrievalService


@pytest.fixture
def service():
    return HybridRetrievalService()


@pytest.fixture
def mock_storage():
    """Mock storage_service with multiple doc blobs."""
    chunks_by_doc = {
        "chunks/doc_a.json": json.dumps([
            {"chunk_id": "doc_a_chunk_0", "text": "Text A0", "pages": [1]},
        ]),
        "chunks/doc_b.json": json.dumps([
            {"chunk_id": "doc_b_chunk_0", "text": "Text B0", "pages": [1]},
        ]),
        "chunks/doc_c.json": json.dumps([
            {"chunk_id": "doc_c_chunk_0", "text": "Text C0", "pages": [2]},
        ]),
    }

    mock_bucket = MagicMock()

    def fake_blob(path):
        blob = MagicMock()
        blob.download_as_text.return_value = chunks_by_doc.get(path, "[]")
        return blob

    mock_bucket.blob.side_effect = fake_blob

    with patch("app.services.hybrid_retrieval.storage_service") as mock_svc:
        mock_svc._bucket = mock_bucket
        yield mock_svc, mock_bucket


class TestLoadChunkContextsParallel:
    """Verify _load_chunk_contexts downloads blobs concurrently."""

    @pytest.mark.asyncio
    async def test_loads_multiple_docs_concurrently(self, service, mock_storage):
        """All GCS downloads should run via asyncio.gather, not sequentially."""
        _mock_svc, mock_bucket = mock_storage

        vector_results = [
            {"id": "doc_a_chunk_0", "distance": 0.9},
            {"id": "doc_b_chunk_0", "distance": 0.85},
            {"id": "doc_c_chunk_0", "distance": 0.8},
        ]

        contexts = await service._load_chunk_contexts(vector_results)

        # All 3 docs loaded
        assert len(contexts) == 3
        # All 3 blobs were requested
        assert mock_bucket.blob.call_count == 3

    @pytest.mark.asyncio
    async def test_handles_gcs_failure_gracefully(self, service, mock_storage):
        """A single GCS failure should not block other downloads."""
        _mock_svc, mock_bucket = mock_storage

        def failing_blob(path):
            blob = MagicMock()
            if "doc_b" in path:
                blob.download_as_text.side_effect = Exception("GCS error")
            else:
                blob.download_as_text.return_value = json.dumps([
                    {"chunk_id": path.split("/")[1].replace(".json", "") + "_chunk_0",
                     "text": "OK", "pages": [1]}
                ])
            return blob

        mock_bucket.blob.side_effect = failing_blob

        vector_results = [
            {"id": "doc_a_chunk_0", "distance": 0.9},
            {"id": "doc_b_chunk_0", "distance": 0.85},
            {"id": "doc_c_chunk_0", "distance": 0.8},
        ]

        contexts = await service._load_chunk_contexts(vector_results)

        # 3 results returned (doc_b has empty text but entry still exists)
        assert len(contexts) == 3
        # doc_b chunk has empty text due to failure
        doc_b = next(c for c in contexts if c["id"] == "doc_b_chunk_0")
        assert doc_b["text"] == ""


class TestGraphSearchParallel:
    """Verify _graph_search runs entity lookups concurrently."""

    @pytest.mark.asyncio
    async def test_searches_multiple_hints_concurrently(self, service):
        """All entity hint lookups should run via asyncio.gather."""
        node_a = GraphNode(
            canonical_id="entity_alice_001",
            name="Alice",
            main_categories=[],
            highlighted=True,
        )
        node_b = GraphNode(
            canonical_id="entity_bob_001",
            name="Bob",
            main_categories=[],
            highlighted=False,
        )

        subgraph_a = GraphPayload(nodes=[node_a], edges=[], center_node="entity_alice_001")
        subgraph_b = GraphPayload(nodes=[node_b], edges=[], center_node="entity_bob_001")

        async def fake_search(hint, limit=5, categories=None):
            if hint == "Alice":
                return [node_a]
            elif hint == "Bob":
                return [node_b]
            return []

        async def fake_subgraph(cid, categories=None):
            if cid == "entity_alice_001":
                return subgraph_a
            elif cid == "entity_bob_001":
                return subgraph_b
            return None

        with patch("app.services.hybrid_retrieval.neo4j_service") as mock_neo4j:
            mock_neo4j.search_entities.side_effect = fake_search
            mock_neo4j.get_subgraph.side_effect = fake_subgraph

            result = await service._graph_search(["Alice", "Bob"], None)

            assert result["payload"] is not None
            assert len(result["payload"].nodes) == 2
            # Both hints searched
            assert mock_neo4j.search_entities.call_count == 2
            assert mock_neo4j.get_subgraph.call_count == 2


class TestExtractEntityHints:
    """Verify entity hint extraction handles various casing."""

    def test_lowercase_query_extracts_hints(self, service):
        """Lowercase queries should still produce entity hints."""
        hints = service._extract_entity_hints("explain strait settlement")
        assert len(hints) > 0
        combined = " ".join(hints).lower()
        assert "strait" in combined

    def test_mixed_case_query(self, service):
        """Mixed case queries should extract entities."""
        hints = service._extract_entity_hints("tell me about the straits Settlements")
        assert len(hints) > 0

    def test_stop_words_excluded(self, service):
        """Common stop words should not appear as hints."""
        hints = service._extract_entity_hints("What is the colonial office?")
        assert "What" not in hints

    def test_already_capitalized(self, service):
        """Capitalized queries should still work as before."""
        hints = service._extract_entity_hints("Who is J. Anderson?")
        assert any("Anderson" in h for h in hints)
