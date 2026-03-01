"""Parse CO 273 document references from natural language queries."""

from __future__ import annotations

import re
from dataclasses import dataclass

# Matches: CO 273:579:1, CO273:579:2a, CO 273.534.6
_DOC_RE = re.compile(
    r"CO\s*273\s*[:./]?\s*(\d+)\s*[:./]?\s*(\d+\w*)",
    re.IGNORECASE,
)

# Matches page ranges: page 1-4, pages 1–4, pp.3-7, pages 2 to 5
_PAGE_RANGE_RE = re.compile(
    r"(?:pages?\s+|pp?\.?\s*)(\d+)\s*(?:[-\u2013\u2014]\s*|to\s+)(\d+)",
    re.IGNORECASE,
)

# Matches single pages: p.85, p85, page 85, p 85
_PAGE_SINGLE_RE = re.compile(
    r"(?:p\.?\s*|page\s+)(\d+)(?!\s*[-\u2013\u2014to]|\d)",
    re.IGNORECASE,
)


@dataclass(frozen=True)
class DocumentReference:
    """A parsed CO 273 document reference.

    Attributes:
        volume: Volume number (e.g. "579")
        file: File number (e.g. "1" or "11a")
        pages: None for all pages, or (start, end) tuple inclusive.
               Single page is represented as (N, N).
    """

    volume: str
    file: str
    pages: tuple[int, int] | None

    @property
    def doc_id(self) -> str:
        return f"CO 273:{self.volume}:{self.file}"


def parse_document_reference(text: str) -> DocumentReference | None:
    """Parse a CO 273 document reference from a text query.

    Returns None if no valid document reference is found.
    """
    doc_match = _DOC_RE.search(text)
    if not doc_match:
        return None

    volume = doc_match.group(1)
    file = doc_match.group(2)

    # Check for page range first (must come before single-page check)
    range_match = _PAGE_RANGE_RE.search(text)
    if range_match:
        start, end = int(range_match.group(1)), int(range_match.group(2))
        return DocumentReference(volume, file, (start, end))

    # Check for single page
    single_match = _PAGE_SINGLE_RE.search(text)
    if single_match:
        page = int(single_match.group(1))
        return DocumentReference(volume, file, (page, page))

    # No page spec → all pages
    return DocumentReference(volume, file, None)
