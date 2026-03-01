"""Tests for full-text page request detection in hybrid retrieval."""

import json
from unittest.mock import MagicMock, patch

import pytest

from app.services.hybrid_retrieval import HybridRetrievalService

OCR_DATA = [
    {"page_number": 1, "text": "Page one full OCR text content here.", "confidence": 0.95},
    {"page_number": 2, "text": "Page two full OCR text content here.", "confidence": 0.88},
    {"page_number": 85, "text": "Page eighty-five text.", "confidence": 0.90},
]


@pytest.fixture
def service():
    return HybridRetrievalService()


@pytest.fixture
def mock_gcs():
    mock_bucket = MagicMock()

    def fake_blob(path):
        blob = MagicMock()
        blob.download_as_text.return_value = json.dumps(OCR_DATA)
        return blob

    mock_bucket.blob.side_effect = fake_blob

    with patch("app.services.hybrid_retrieval.storage_service") as mock_svc:
        mock_svc._bucket = mock_bucket
        yield mock_svc


@pytest.mark.anyio
async def test_detects_full_text_with_page(service, mock_gcs):
    result = await service._try_full_text_request(
        "give me the full text of CO273:579:1 p.85"
    )
    assert result is not None
    assert "Page eighty-five text." in result.answer
    assert result.source_type == "archive"
    assert len(result.citations) == 1
    assert result.citations[0].doc_id == "CO 273:579:1"
    assert result.citations[0].pages == [85]


@pytest.mark.anyio
async def test_detects_full_text_with_space(service, mock_gcs):
    result = await service._try_full_text_request(
        "show the text of CO 273:579:1 page 2"
    )
    assert result is not None
    assert "Page two full OCR text content here." in result.answer


@pytest.mark.anyio
async def test_detects_full_text_default_page(service, mock_gcs):
    result = await service._try_full_text_request(
        "full text of CO 273:579:1"
    )
    assert result is not None
    assert "Page one full OCR text content here." in result.answer
    assert result.citations[0].pages == [1]


@pytest.mark.anyio
async def test_ignores_normal_question(service):
    result = await service._try_full_text_request(
        "Who was the governor of the Straits Settlements?"
    )
    assert result is None


@pytest.mark.anyio
async def test_returns_none_for_missing_doc(service):
    with patch("app.services.hybrid_retrieval.storage_service") as mock_svc:
        mock_svc._bucket = MagicMock()
        mock_svc._bucket.blob.return_value.download_as_text.side_effect = Exception(
            "Not Found"
        )
        result = await service._try_full_text_request(
            "full text of CO 273:999:1 p.1"
        )
    # Falls through to normal pipeline when GCS fails
    assert result is None
