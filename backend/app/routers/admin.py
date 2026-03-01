"""Admin endpoints for document and OCR quality management."""

from __future__ import annotations

import json
import logging
import re

from fastapi import APIRouter, HTTPException

from app.config.settings import settings
from app.services.storage import storage_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/documents")
async def list_documents() -> dict:
    """List all ingested document IDs from GCS ocr/ prefix."""
    try:
        blobs = storage_service._bucket.list_blobs(prefix="ocr/")
        doc_ids = []
        for blob in blobs:
            # Extract doc_id from "ocr/{doc_id}_ocr.json"
            match = re.match(r"ocr/(.+)_ocr\.json$", blob.name)
            if match:
                doc_ids.append(match.group(1))
        return {"documents": sorted(doc_ids)}
    except Exception:
        logger.exception("Failed to list documents from GCS")
        raise HTTPException(status_code=500, detail="Failed to list documents")


@router.get("/documents/{doc_id}/ocr")
async def document_ocr_quality(doc_id: str) -> dict:
    """Return OCR quality data for a specific document."""
    blob_path = f"ocr/{doc_id}_ocr.json"
    try:
        blob = storage_service._bucket.blob(blob_path)
        raw = blob.download_as_text()
        pages = json.loads(raw)
    except Exception:
        logger.exception("Failed to load OCR data for %s", doc_id)
        raise HTTPException(status_code=404, detail=f"OCR data not found for {doc_id}")

    flagged = [
        {"page": p["page_number"], "confidence": p["confidence"]}
        for p in pages
        if p.get("confidence", 1.0) < settings.OCR_CONFIDENCE_FLAG
    ]

    avg_confidence = (
        sum(p.get("confidence", 0) for p in pages) / len(pages) if pages else 0
    )

    return {
        "doc_id": doc_id,
        "total_pages": len(pages),
        "avg_confidence": round(avg_confidence, 3),
        "flagged_pages": flagged,
        "flagged_count": len(flagged),
    }
