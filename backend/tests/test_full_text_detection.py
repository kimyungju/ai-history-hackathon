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
    # Now returns all pages, not just page 1
    assert "Page one full OCR text content here." in result.answer
    assert "Page two full OCR text content here." in result.answer
    assert result.citations[0].pages == [1, 2, 85]


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
    # Returns a clear not-found message
    assert result is not None
    assert "not found" in result.answer.lower()


@pytest.mark.anyio
async def test_full_text_all_pages(service, mock_gcs):
    """'full text of CO 273:579:1' should return ALL pages, not just page 1."""
    result = await service._try_full_text_request(
        "give me the full text of CO 273:579:1"
    )
    assert result is not None
    assert "Page one full OCR text content here." in result.answer
    assert "Page two full OCR text content here." in result.answer
    assert "Page eighty-five text." in result.answer
    assert result.citations[0].pages == [1, 2, 85]


@pytest.mark.anyio
async def test_page_range(service, mock_gcs):
    """'CO 273:579:1 page 1-2' should return pages 1 and 2 only."""
    result = await service._try_full_text_request(
        "CO 273:579:1 page 1-2"
    )
    assert result is not None
    assert "Page one full OCR text content here." in result.answer
    assert "Page two full OCR text content here." in result.answer
    assert "Page eighty-five text." not in result.answer


@pytest.mark.anyio
async def test_page_range_en_dash(service, mock_gcs):
    """'CO 273:579:1 page 1\u20134' (en-dash) should work."""
    result = await service._try_full_text_request(
        "CO 273:579:1 page 1\u20132"
    )
    assert result is not None
    assert "Page one full OCR text content here." in result.answer
    assert "Page two full OCR text content here." in result.answer


@pytest.mark.anyio
async def test_doc_ref_with_pages_bypasses_without_trigger(service, mock_gcs):
    """Doc ref + explicit page spec should bypass even without 'full text' trigger."""
    result = await service._try_full_text_request(
        "CO 273:579:1 page 1-2"
    )
    assert result is not None  # no trigger phrase, but has doc ref + pages


@pytest.mark.anyio
async def test_doc_not_found_clear_message(service):
    """Missing document should return a clear 'not found' response, not None."""
    with patch("app.services.hybrid_retrieval.storage_service") as mock_svc:
        mock_svc._bucket = MagicMock()
        mock_svc._bucket.blob.return_value.download_as_text.side_effect = Exception(
            "Not Found"
        )
        result = await service._try_full_text_request(
            "full text of CO 273:999:1"
        )
    # Should return a user-friendly not-found message, not None
    assert result is not None
    assert "not found" in result.answer.lower()
