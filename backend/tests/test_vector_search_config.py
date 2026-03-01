"""Tests for VectorSearchService endpoint configuration."""

from app.services.vector_search import VectorSearchService


def test_extract_endpoint_id_from_domain():
    """Domain-style endpoint should be parsed to numeric prefix."""
    svc = VectorSearchService()
    domain = "1005598664.asia-southeast1-58449340870.vdb.vertexai.goog"
    assert svc._parse_endpoint_name(domain) == "1005598664"


def test_extract_endpoint_id_from_numeric():
    """Pure numeric endpoint ID should pass through unchanged."""
    svc = VectorSearchService()
    assert svc._parse_endpoint_name("7992877787885076480") == "7992877787885076480"


def test_extract_endpoint_id_from_resource_name():
    """Full resource name should pass through unchanged."""
    svc = VectorSearchService()
    full = "projects/123/locations/us-central1/indexEndpoints/456"
    assert svc._parse_endpoint_name(full) == full
