"""Vertex AI Vector Search service for the Colonial Archives Graph-RAG backend."""

import asyncio
import logging
from typing import Any

from google.cloud import aiplatform
from google.cloud.aiplatform.matching_engine import MatchingEngineIndexEndpoint
from google.cloud.aiplatform.matching_engine.matching_engine_index_endpoint import (
    Namespace,
)
from google.cloud.aiplatform_v1.types import index as gca_index

from app.config.settings import settings
from app.models.schemas import Chunk

logger = logging.getLogger(__name__)


class VectorSearchService:
    """Manages upsert and similarity search against a Vertex AI Vector Search index."""

    def __init__(self) -> None:
        self._initialized = False
        self._endpoint: MatchingEngineIndexEndpoint | None = None
        self._idx: aiplatform.MatchingEngineIndex | None = None

    def _ensure_init(self) -> None:
        if not self._initialized:
            aiplatform.init(
                project=settings.GCP_PROJECT_ID,
                location=settings.GCP_REGION,
            )
            self._initialized = True

    # ------------------------------------------------------------------
    # Lazy-loaded endpoint and index
    # ------------------------------------------------------------------

    @staticmethod
    def _parse_endpoint_name(raw: str) -> str:
        """Normalise endpoint config to a value the SDK accepts.

        Accepts:
          - Numeric endpoint ID (pass-through)
          - Full resource name (pass-through)
          - Public domain name → extract numeric prefix
        """
        if raw.endswith(".vdb.vertexai.goog"):
            return raw.split(".")[0]
        return raw

    @property
    def endpoint(self) -> MatchingEngineIndexEndpoint:
        """Return the MatchingEngineIndexEndpoint, creating it on first access."""
        if self._endpoint is None:
            self._ensure_init()
            endpoint_name = self._parse_endpoint_name(settings.VECTOR_SEARCH_ENDPOINT)
            self._endpoint = MatchingEngineIndexEndpoint(
                index_endpoint_name=endpoint_name,
            )
        return self._endpoint

    @property
    def index(self) -> aiplatform.MatchingEngineIndex:
        """Return a lazily-initialized MatchingEngineIndex pinned to the correct region.

        Uses the full resource name so it is immune to global vertexai.init()
        region changes caused by other services (e.g. entity extraction).
        """
        if self._idx is None:
            self._ensure_init()
            full_name = (
                f"projects/{settings.GCP_PROJECT_ID}"
                f"/locations/{settings.GCP_REGION}"
                f"/indexes/{settings.VECTOR_SEARCH_INDEX_ID}"
            )
            self._idx = aiplatform.MatchingEngineIndex(index_name=full_name)
        return self._idx

    # ------------------------------------------------------------------
    # Upsert
    # ------------------------------------------------------------------

    async def upsert(
        self,
        chunks: list[Chunk],
        embeddings: list[list[float]],
    ) -> int:
        """Upsert chunk embeddings into Vector Search.

        Datapoints are batched in groups of 100 and sent via
        ``upsert_datapoints`` on the underlying index.

        Returns:
            The total number of vectors upserted.
        """
        if len(chunks) != len(embeddings):
            raise ValueError(
                f"chunks ({len(chunks)}) and embeddings ({len(embeddings)}) must have the same length"
            )

        datapoints: list[dict[str, Any]] = []
        for chunk, embedding in zip(chunks, embeddings):
            # Use a single Restriction with all categories in allow_list.
            # Vector Search does not allow the same namespace to appear
            # more than once in restricts.
            restricts = [
                gca_index.IndexDatapoint.Restriction(
                    namespace="category", allow_list=list(chunk.categories)
                )
            ]
            datapoints.append(
                {
                    "datapoint_id": chunk.chunk_id,
                    "feature_vector": embedding,
                    "restricts": restricts,
                }
            )

        # Cache the index reference to avoid re-creating per batch and to
        # ensure we always target the correct region even when other services
        # (e.g. entity extraction) call vertexai.init with a different region.
        idx = self.index
        loop = asyncio.get_event_loop()
        upserted = 0
        batch_size = 100

        for i in range(0, len(datapoints), batch_size):
            batch = datapoints[i : i + batch_size]
            logger.info(
                "Upserting batch %d-%d of %d datapoints",
                i,
                i + len(batch),
                len(datapoints),
            )
            await loop.run_in_executor(
                None,
                lambda b=batch: idx.upsert_datapoints(datapoints=b),
            )
            upserted += len(batch)

        logger.info("Upserted %d vectors into Vector Search", upserted)
        return upserted

    # ------------------------------------------------------------------
    # Search
    # ------------------------------------------------------------------

    async def search(
        self,
        query_embedding: list[float],
        top_k: int | None = None,
        filter_categories: list[str] | None = None,
    ) -> list[dict]:
        """Search for similar chunks in Vector Search.

        Args:
            query_embedding: The embedding vector for the query.
            top_k: Maximum number of neighbours to return.
                    Defaults to ``settings.VECTOR_TOP_K``.
            filter_categories: If provided, restrict results to chunks that
                               belong to at least one of these categories.

        Returns:
            A list of dicts with ``id`` (str) and ``distance`` (float).
        """
        if top_k is None:
            top_k = settings.VECTOR_TOP_K

        restricts: list[Namespace] | None = None
        if filter_categories:
            restricts = [
                Namespace(name="category", allow_tokens=filter_categories),
            ]

        loop = asyncio.get_event_loop()

        def _find() -> list[list[Any]]:
            kwargs: dict[str, Any] = {
                "deployed_index_id": settings.VECTOR_SEARCH_DEPLOYED_INDEX_ID,
                "queries": [query_embedding],
                "num_neighbors": top_k,
            }
            if restricts is not None:
                kwargs["per_crowding_attribute_num_neighbors"] = 0
                kwargs["restricts"] = restricts
            return self.endpoint.find_neighbors(**kwargs)

        response = await loop.run_in_executor(None, _find)

        results: list[dict] = []
        if response and len(response) > 0:
            for neighbor in response[0]:
                results.append(
                    {
                        "id": neighbor.id,
                        "distance": neighbor.distance,
                    }
                )

        logger.info(
            "Vector search returned %d results (top_k=%d, filters=%s)",
            len(results),
            top_k,
            filter_categories,
        )
        return results


# Module-level singleton
vector_search_service = VectorSearchService()
