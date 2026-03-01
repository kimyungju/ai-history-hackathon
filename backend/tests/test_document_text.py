"""Tests for the multi-page document text endpoint."""

import json
from unittest.mock import MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app

OCR_DATA = [
    {"page_number": 1, "text": "Page one text.", "confidence": 0.95},
    {"page_number": 2, "text": "Page two text.", "confidence": 0.88},
    {"page_number": 3, "text": "Page three text.", "confidence": 0.92},
]


@pytest.fixture
def mock_gcs():
    with patch("app.routers.query.storage_service") as mock_svc:
        mock_bucket = MagicMock()
        blob = MagicMock()
        blob.download_as_text.return_value = json.dumps(OCR_DATA)
        mock_bucket.blob.return_value = blob
        mock_svc._bucket = mock_bucket
        yield mock_svc


@pytest.mark.anyio
async def test_get_all_pages(mock_gcs):
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        resp = await client.get("/document/CO 273:579:1/text")
    assert resp.status_code == 200
    data = resp.json()
    assert data["doc_id"] == "CO 273:579:1"
    assert data["total_pages"] == 3
    assert len(data["pages"]) == 3


@pytest.mark.anyio
async def test_get_page_range(mock_gcs):
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        resp = await client.get("/document/CO 273:579:1/text?page_start=1&page_end=2")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["pages"]) == 2
    assert data["pages"][0]["page_number"] == 1
    assert data["pages"][1]["page_number"] == 2


@pytest.mark.anyio
async def test_get_single_page_via_range(mock_gcs):
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        resp = await client.get("/document/CO 273:579:1/text?page_start=2&page_end=2")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["pages"]) == 1
    assert data["pages"][0]["page_number"] == 2


@pytest.mark.anyio
async def test_doc_not_found():
    with patch("app.routers.query.storage_service") as mock_svc:
        mock_bucket = MagicMock()
        mock_bucket.blob.return_value.download_as_text.side_effect = Exception("Not Found")
        mock_svc._bucket = mock_bucket
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.get("/document/CO 273:999:1/text")
    assert resp.status_code == 404
