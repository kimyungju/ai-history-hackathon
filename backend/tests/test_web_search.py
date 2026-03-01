"""Tests for Tavily web search service."""

import pytest
from unittest.mock import patch, MagicMock

from app.services.web_search import web_search_service


@pytest.mark.asyncio
async def test_search_returns_formatted_results():
    """Web search returns list of dicts with id, title, url, text, cite_type."""
    mock_response = {
        "results": [
            {"title": "Straits Settlements - Wikipedia", "url": "https://en.wikipedia.org/wiki/Straits_Settlements", "content": "The Straits Settlements were a group of British territories."},
            {"title": "Colonial Singapore", "url": "https://example.com/colonial", "content": "Singapore was a crown colony from 1867."},
        ]
    }

    with patch.object(web_search_service, "_client") as mock_client:
        mock_client.search.return_value = mock_response
        with patch.object(type(web_search_service), "client", new_callable=lambda: property(lambda self: mock_client)):
            results = await web_search_service.search("Straits Settlements history")

    assert len(results) == 2
    assert results[0]["id"] == "web_1"
    assert results[0]["cite_type"] == "web"
    assert results[0]["title"] == "Straits Settlements - Wikipedia"
    assert results[0]["url"] == "https://en.wikipedia.org/wiki/Straits_Settlements"
    assert "British territories" in results[0]["text"]
    assert results[1]["id"] == "web_2"


@pytest.mark.asyncio
async def test_search_returns_empty_on_no_results():
    """Web search returns empty list when Tavily returns no results."""
    mock_response = {"results": []}

    with patch.object(web_search_service, "_client") as mock_client:
        mock_client.search.return_value = mock_response
        with patch.object(type(web_search_service), "client", new_callable=lambda: property(lambda self: mock_client)):
            results = await web_search_service.search("xyznonexistent")

    assert results == []


@pytest.mark.asyncio
async def test_search_handles_api_error():
    """Web search returns empty list on Tavily API error."""
    with patch.object(web_search_service, "_client") as mock_client:
        mock_client.search.side_effect = Exception("API rate limit")
        with patch.object(type(web_search_service), "client", new_callable=lambda: property(lambda self: mock_client)):
            results = await web_search_service.search("test query")

    assert results == []
