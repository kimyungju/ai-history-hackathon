"""Tests for admin OCR quality endpoints."""

import json
from unittest.mock import MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient


@pytest.fixture
def mock_storage_blobs():
    """Mock storage_service for listing and reading OCR blobs."""
    ocr_data = [
        {"page_number": 1, "text": "Page 1 text", "confidence": 0.95},
        {"page_number": 2, "text": "Page 2 text", "confidence": 0.42},
        {"page_number": 3, "text": "Page 3 text", "confidence": 0.88},
    ]

    mock_bucket = MagicMock()

    # Mock list_blobs
    blob1 = MagicMock()
    blob1.name = "ocr/doc_alpha_ocr.json"
    blob2 = MagicMock()
    blob2.name = "ocr/doc_beta_ocr.json"
    mock_bucket.list_blobs.return_value = [blob1, blob2]

    # Mock blob download
    def fake_blob(path):
        blob = MagicMock()
        blob.download_as_text.return_value = json.dumps(ocr_data)
        return blob

    mock_bucket.blob.side_effect = fake_blob

    with patch("app.routers.admin.storage_service") as mock_svc:
        mock_svc._bucket = mock_bucket
        yield mock_svc, mock_bucket


@pytest.mark.asyncio
async def test_list_documents(mock_gcp, mock_storage_blobs):
    from app.main import app

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        resp = await client.get("/admin/documents")

    assert resp.status_code == 200
    data = resp.json()
    assert len(data["documents"]) == 2
    assert "doc_alpha" in data["documents"]
    assert "doc_beta" in data["documents"]


@pytest.mark.asyncio
async def test_document_ocr_quality(mock_gcp, mock_storage_blobs):
    from app.main import app

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        resp = await client.get("/admin/documents/doc_alpha/ocr")

    assert resp.status_code == 200
    data = resp.json()
    assert data["doc_id"] == "doc_alpha"
    assert data["total_pages"] == 3
    assert len(data["flagged_pages"]) == 1
    assert data["flagged_pages"][0]["page"] == 2
    assert data["flagged_pages"][0]["confidence"] == 0.42
