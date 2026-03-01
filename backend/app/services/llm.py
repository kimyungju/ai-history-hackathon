"""Vertex AI Gemini LLM service for the Colonial Archives Graph-RAG backend."""

import asyncio
import logging

import vertexai
from vertexai.generative_models import GenerationConfig, GenerativeModel

from app.config.settings import settings

logger = logging.getLogger(__name__)

ANSWER_GENERATION_PROMPT = """You are a research assistant for colonial-era Straits Settlements archives.

Context retrieved from colonial archive documents:
\"\"\"
{context}
\"\"\"

Sources: {citations}

Rules:
1. Answer ONLY using information from the archive context above.
2. Cite every fact using [archive:N] markers.
3. Colonial archives may contain OCR artifacts, financial tables, or fragmented text — extract meaning where possible.
4. If the context genuinely does not contain information to answer the question, respond exactly: "I cannot answer this based on the available sources."
5. NEVER infer, guess, or use external knowledge.

User question: {question}"""

WEB_FALLBACK_PROMPT = """Context from web sources:
\"\"\"
{context}
\"\"\"

Sources: {citations}

Rules:
1. Answer using information from the web context above.
2. Cite every fact using [web:N] markers.
3. Be concise and factual.

User question: {question}"""

FALLBACK_ANSWER = "I cannot answer this based on the available sources."


class LlmService:
    """Wraps the Vertex AI Gemini GenerativeModel for answer generation."""

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
            logger.info(
                "LlmService initialised with model=%s in %s",
                settings.VERTEX_LLM_MODEL,
                settings.VERTEX_LLM_REGION,
            )
        return self._model

    async def generate_answer(
        self,
        question: str,
        context_chunks: list[dict],
        source_type: str = "archive",
        prompt_template: str | None = None,
    ) -> dict:
        """Generate a grounded answer from retrieved context chunks.

        Each entry in *context_chunks* is expected to carry at least a ``text``
        key.  An optional ``id`` key is used for citation numbering; otherwise
        the 1-based index is used.

        Returns a dict with ``answer`` (str) and ``context_chunks`` (the input
        list passed through for downstream traceability).
        """
        # Build the context block and citation reference list.
        # Use per-chunk cite_type for mixed source support (Phase 4).
        context_parts: list[str] = []
        citation_refs: list[str] = []
        archive_idx = 0
        web_idx = 0

        for chunk in context_chunks:
            cite_type = chunk.get("cite_type", "archive")
            if cite_type == "web":
                web_idx += 1
                prefix = f"[web:{web_idx}]"
            else:
                archive_idx += 1
                prefix = f"[archive:{archive_idx}]"
            context_parts.append(f"{prefix} {chunk.get('text', '')}")
            citation_refs.append(prefix)

        context_str = "\n\n".join(context_parts)
        citations_str = "; ".join(citation_refs)

        template = prompt_template if prompt_template is not None else ANSWER_GENERATION_PROMPT
        prompt = template.format(
            context=context_str,
            citations=citations_str,
            source_type=source_type,
            question=question,
        )

        logger.info(
            "Generating answer for question (%d chars) with %d context chunks",
            len(question),
            len(context_chunks),
        )

        loop = asyncio.get_event_loop()

        generation_config = GenerationConfig(
            temperature=0.1,
            max_output_tokens=2048,
        )

        try:
            response = await loop.run_in_executor(
                None,
                lambda: self.model.generate_content(
                    prompt,
                    generation_config=generation_config,
                ),
            )
        except Exception:
            logger.exception("Gemini generate_content call failed")
            return {
                "answer": FALLBACK_ANSWER,
                "context_chunks": context_chunks,
            }

        answer_text = response.text if response.text else None

        if not answer_text:
            logger.warning("Gemini returned empty response; using fallback")
            answer_text = FALLBACK_ANSWER

        logger.info("Generated answer (%d chars)", len(answer_text))

        return {
            "answer": answer_text,
            "context_chunks": context_chunks,
        }


llm_service = LlmService()
