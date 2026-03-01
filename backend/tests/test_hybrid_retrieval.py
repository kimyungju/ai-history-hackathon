"""Tests for hybrid retrieval performance optimizations."""

import asyncio
import json
from unittest.mock import MagicMock, patch

import pytest

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
