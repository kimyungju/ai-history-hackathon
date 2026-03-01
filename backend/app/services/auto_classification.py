"""Auto-classification service for unmapped documents.

Phase 4: Uses Gemini Flash to classify documents into one of 5 MAIN_CATEGORIES
when no manual mapping exists in document_categories.json.
"""

from __future__ import annotations

import asyncio
import json
import logging

import vertexai
from vertexai.generative_models import GenerationConfig, GenerativeModel

from app.config.settings import settings
from app.models.schemas import MAIN_CATEGORIES

logger = logging.getLogger(__name__)

CLASSIFICATION_PROMPT = """You are a document classifier for colonial-era British archives (primarily Straits Settlements CO 273 series).

Classify the following document excerpt into exactly ONE of these categories:
1. Internal Relations and Research
2. Economic and Financial
3. Social Services
4. Defence and Military
5. General and Establishment

Category descriptions:
- "Internal Relations and Research": Diplomatic correspondence, inter-colonial relations, political affairs, surveys, and research reports.
- "Economic and Financial": Trade, revenue, taxation, customs duties, commerce, budgets, and financial administration.
- "Social Services": Education, health, welfare, immigration, labor, and public works.
- "Defence and Military": Military operations, defence planning, police, security, and wartime matters.
- "General and Establishment": Administrative appointments, regulations, civil service, constitutional matters, and anything not fitting the above.

Document excerpt:
\"\"\"
{text_sample}
\"\"\"

Respond with ONLY valid JSON (no markdown): {{"category": "<exact category name>", "confidence": <0.0-1.0>}}"""

FALLBACK_CATEGORY = "General and Establishment"


class AutoClassificationService:
    """Classifies documents into MAIN_CATEGORIES using Gemini Flash."""

    def __init__(self) -> None:
        self._model = None

    @property
    def model(self):
        if self._model is None:
            vertexai.init(
                project=settings.GCP_PROJECT_ID,
                location=settings.VERTEX_LLM_REGION,
            )
            self._model = GenerativeModel(settings.VERTEX_LLM_MODEL)
            logger.info("AutoClassificationService initialised")
        return self._model

    async def classify(self, text_sample: str) -> tuple[str, float]:
        """Classify a document excerpt into one of MAIN_CATEGORIES.

        Args:
            text_sample: Text excerpt from the document (typically first page OCR).

        Returns:
            Tuple of (category_name, confidence). Falls back to
            'General and Establishment' with confidence 0.0 on error.
        """
        truncated = text_sample[:2000]
        prompt = CLASSIFICATION_PROMPT.format(text_sample=truncated)

        loop = asyncio.get_event_loop()
        generation_config = GenerationConfig(
            temperature=0.1,
            max_output_tokens=256,
        )

        try:
            response = await loop.run_in_executor(
                None,
                lambda: self.model.generate_content(
                    prompt, generation_config=generation_config
                ),
            )
        except Exception:
            logger.exception("Auto-classification LLM call failed")
            return FALLBACK_CATEGORY, 0.0

        try:
            result = json.loads(response.text)
            category = result.get("category", FALLBACK_CATEGORY)
            confidence = float(result.get("confidence", 0.0))

            if category not in MAIN_CATEGORIES:
                logger.warning(
                    "LLM returned invalid category '%s'; falling back to '%s'",
                    category,
                    FALLBACK_CATEGORY,
                )
                category = FALLBACK_CATEGORY
                confidence = min(confidence, 0.3)

            return category, confidence

        except (json.JSONDecodeError, ValueError):
            logger.warning("Failed to parse classification response: %s", response.text)
            return FALLBACK_CATEGORY, 0.3


# Module-level singleton
auto_classification_service = AutoClassificationService()
