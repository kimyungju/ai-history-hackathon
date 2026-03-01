"""Tests for document reference parsing."""

import pytest

from app.services.document_reference import DocumentReference, parse_document_reference


class TestParseDocumentReference:
    """Tests for parse_document_reference()."""

    # --- Full document (no page spec) ---

    def test_full_text_no_page(self):
        ref = parse_document_reference("give me the full text of CO 273:579:1")
        assert ref is not None
        assert ref.doc_id == "CO 273:579:1"
        assert ref.pages is None  # all pages

    def test_show_me_doc(self):
        ref = parse_document_reference("show me CO 273:579:7")
        assert ref is not None
        assert ref.doc_id == "CO 273:579:7"
        assert ref.pages is None

    # --- Single page ---

    def test_single_page_dot(self):
        ref = parse_document_reference("full text of CO 273:579:1 p.85")
        assert ref is not None
        assert ref.doc_id == "CO 273:579:1"
        assert ref.pages == (85, 85)

    def test_single_page_word(self):
        ref = parse_document_reference("show the text of CO 273:579:1 page 2")
        assert ref is not None
        assert ref.pages == (2, 2)

    # --- Page ranges ---

    def test_page_range_hyphen(self):
        ref = parse_document_reference("CO 273:579:1 page 1-4")
        assert ref is not None
        assert ref.doc_id == "CO 273:579:1"
        assert ref.pages == (1, 4)

    def test_page_range_en_dash(self):
        ref = parse_document_reference("CO 273:579:1 pages 1\u20134")
        assert ref is not None
        assert ref.pages == (1, 4)

    def test_page_range_pp(self):
        ref = parse_document_reference("CO 273:579:1 pp.3-7")
        assert ref is not None
        assert ref.pages == (3, 7)

    def test_page_range_to(self):
        ref = parse_document_reference("CO 273:579:1 pages 2 to 5")
        assert ref is not None
        assert ref.pages == (2, 5)

    # --- Doc ID format variants ---

    def test_no_space(self):
        ref = parse_document_reference("full text of CO273:579:1")
        assert ref is not None
        assert ref.doc_id == "CO 273:579:1"

    def test_dot_separator(self):
        ref = parse_document_reference("full text of CO 273.579.1")
        assert ref is not None
        assert ref.doc_id == "CO 273:579:1"

    def test_alphanumeric_part(self):
        ref = parse_document_reference("full text of CO 273:534:11a")
        assert ref is not None
        assert ref.doc_id == "CO 273:534:11a"

    # --- No match ---

    def test_no_doc_ref(self):
        ref = parse_document_reference("Who was the governor of the Straits Settlements?")
        assert ref is None

    def test_partial_ref(self):
        ref = parse_document_reference("Tell me about CO 273")
        assert ref is None  # no volume:file pair
