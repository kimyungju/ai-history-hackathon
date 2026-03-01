"""Tests for page text retrieval endpoint."""

import json
from unittest.mock import MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient


OCR_DATA = [
    {"page_number": 1, "text": "First page OCR text content.", "confidence": 0.95},
    {"page_number": 2, "text": "Second page OCR text here.", "confidence": 0.88},
    {"page_number": 3, "text": "Third page text.", "confidence": 0.42},
]


@pytest.fixture
def mock_storage():
    mock_bucket = MagicMock()

    def fake_blob(path):
        blob = MagicMock()
        blob.download_as_text.return_value = json.dumps(OCR_DATA)
        return blob

    mock_bucket.blob.side_effect = fake_blob

    with patch("app.routers.query.storage_service") as mock_svc:
        mock_svc._bucket = mock_bucket
        yield mock_svc, mock_bucket


@pytest.mark.anyio
async def test_page_text_returns_correct_page(mock_storage):
    from app.main import app

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        resp = await client.get("/document/CO 273:579:1/pages/2/text")
    assert resp.status_code == 200
    data = resp.json()
    assert data["doc_id"] == "CO 273:579:1"
    assert data["page"] == 2
    assert data["text"] == "Second page OCR text here."
    assert data["confidence"] == 0.88
    assert data["total_pages"] == 3


@pytest.mark.anyio
async def test_page_text_out_of_range(mock_storage):
    from app.main import app

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        resp = await client.get("/document/CO 273:579:1/pages/99/text")
    assert resp.status_code == 404
    assert "not found" in resp.json()["detail"].lower()


@pytest.mark.anyio
async def test_page_text_missing_document():
    from app.main import app

    with patch("app.routers.query.storage_service") as mock_svc:
        mock_svc._bucket = MagicMock()
        mock_svc._bucket.blob.return_value.download_as_text.side_effect = Exception(
            "Not Found"
        )

        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.get("/document/nonexistent/pages/1/text")
    assert resp.status_code == 404
