"""Tavily web search service for the Colonial Archives Graph-RAG backend.

Phase 4: Provides web search fallback when archive relevance is low.
Only triggered when combined relevance score < RELEVANCE_THRESHOLD (0.7).
"""

from __future__ import annotations

import asyncio
import logging

from app.config.settings import settings

logger = logging.getLogger(__name__)


class WebSearchService:
    """Wraps the Tavily API for web search fallback."""

    def __init__(self) -> None:
        self._client = None

    @property
    def client(self):
        if self._client is None:
            from tavily import TavilyClient

            self._client = TavilyClient(api_key=settings.TAVILY_API_KEY)
            logger.info("TavilyClient initialised")
        return self._client

    async def search(self, query: str, max_results: int = 5) -> list[dict]:
        """Search the web via Tavily and return formatted results.

        Each result dict has: id, title, url, text, cite_type.
        Returns an empty list on error (web search is best-effort).
        """
        loop = asyncio.get_event_loop()

        try:
            response = await loop.run_in_executor(
                None,
                lambda: self.client.search(
                    query, search_depth="basic", max_results=max_results
                ),
            )
        except Exception:
            logger.exception("Tavily search failed for query: %s", query)
            return []

        results: list[dict] = []
        for i, r in enumerate(response.get("results", []), start=1):
            results.append(
                {
                    "id": f"web_{i}",
                    "title": r.get("title", ""),
                    "url": r.get("url", ""),
                    "text": r.get("content", ""),
                    "cite_type": "web",
                }
            )

        logger.info("Tavily returned %d results for query: %s", len(results), query)
        return results


# Module-level singleton
web_search_service = WebSearchService()
