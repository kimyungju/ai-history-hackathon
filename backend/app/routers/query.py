"""Query router -- Q&A, document signed-URL, and PDF proxy endpoints."""

import asyncio
import json
import logging
from urllib.parse import quote

from fastapi import APIRouter, HTTPException
from fastapi.responses import Response

from app.config.settings import settings
from app.models.schemas import QueryRequest, QueryResponse, SignedUrlResponse
from app.services.hybrid_retrieval import hybrid_retrieval_service
from app.services.storage import storage_service

logger = logging.getLogger(__name__)

router = APIRouter(tags=["query"])


@router.post("/query", response_model=QueryResponse)
async def query(request: QueryRequest) -> QueryResponse:
    """Run a hybrid retrieval query and return the answer with citations."""
    return await hybrid_retrieval_service.query(
        question=request.question,
        filter_categories=request.filter_categories,
    )


@router.get("/document/signed_url", response_model=SignedUrlResponse)
async def document_signed_url(
    doc_id: str, page: int = 1,
) -> SignedUrlResponse:
    """Generate a temporary signed URL for a document PDF.

    If signed URL generation fails (e.g. running with user ADC credentials),
    falls back to a proxy URL that streams the PDF through the backend.
    """
    pdf_url = storage_service.get_pdf_url(doc_id)

    try:
        signed_url = await asyncio.get_event_loop().run_in_executor(
            None, storage_service.generate_signed_url, pdf_url,
        )
    except Exception as exc:
        logger.warning("Signed URL generation raised: %s", exc)
        signed_url = None

    if signed_url is not None:
        return SignedUrlResponse(
            url=signed_url,
            expires_in=settings.SIGNED_URL_EXPIRY_MINUTES * 60,
        )

    # Fallback: return a proxy URL served by this backend
    encoded_doc_id = quote(doc_id, safe="")
    proxy_url = f"/document/proxy/{encoded_doc_id}"
    logger.info("Using proxy URL fallback for doc_id=%s", doc_id)
    return SignedUrlResponse(url=proxy_url, expires_in=3600)


@router.get("/document/{doc_id:path}/pages/{page}/text")
async def document_page_text(doc_id: str, page: int) -> dict:
    """Return raw OCR text for a specific page of a document.

    Reads the OCR JSON from GCS (``ocr/{doc_id}_ocr.json``) and returns
    the text and confidence for the requested page number.
    """
    blob_path = f"ocr/{doc_id}_ocr.json"
    try:
        blob = storage_service._bucket.blob(blob_path)
        loop = asyncio.get_event_loop()
        raw = await loop.run_in_executor(None, blob.download_as_text)
        pages = json.loads(raw)
    except Exception:
        logger.warning("OCR data not found for %s", doc_id)
        raise HTTPException(status_code=404, detail=f"OCR data not found for '{doc_id}'")

    # Find the requested page (1-indexed)
    for p in pages:
        if p["page_number"] == page:
            return {
                "doc_id": doc_id,
                "page": page,
                "text": p["text"],
                "confidence": p.get("confidence", 0.0),
                "total_pages": len(pages),
            }

    raise HTTPException(
        status_code=404,
        detail=f"Page {page} not found in '{doc_id}' (total pages: {len(pages)})",
    )


@router.get("/document/proxy/{doc_id:path}")
async def document_proxy(doc_id: str) -> Response:
    """Stream a PDF from Cloud Storage through the backend.

    This is a fallback for when signed URL generation fails (e.g. local dev
    with user ADC credentials that cannot sign blobs).
    """
    pdf_url = storage_service.get_pdf_url(doc_id)

    try:
        pdf_bytes = await asyncio.get_event_loop().run_in_executor(
            None, storage_service.read_pdf_bytes, pdf_url,
        )
    except Exception as exc:
        logger.error("Failed to proxy PDF for doc_id=%s: %s", doc_id, exc)
        raise HTTPException(
            status_code=404,
            detail=f"Document '{doc_id}' not found in storage.",
        ) from exc

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'inline; filename="{doc_id}.pdf"',
            "Cache-Control": "private, max-age=3600",
        },
    )
