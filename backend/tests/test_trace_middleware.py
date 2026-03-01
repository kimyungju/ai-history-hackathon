import pytest
from httpx import AsyncClient, ASGITransport
from fastapi import FastAPI

from app.config.logging_config import trace_id_var
from app.middleware.trace import TraceMiddleware


def _make_app() -> FastAPI:
    """Create a minimal FastAPI app with TraceMiddleware for testing."""
    app = FastAPI()
    app.add_middleware(TraceMiddleware)

    @app.get("/test")
    async def test_endpoint():
        return {"trace_id": trace_id_var.get("")}

    return app


@pytest.mark.asyncio
async def test_middleware_generates_trace_id():
    app = _make_app()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/test")
    assert response.status_code == 200
    assert "X-Trace-Id" in response.headers
    trace_id = response.headers["X-Trace-Id"]
    assert len(trace_id) == 32  # UUID hex without dashes


@pytest.mark.asyncio
async def test_middleware_propagates_cloud_trace_header():
    app = _make_app()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get(
            "/test",
            headers={"X-Cloud-Trace-Context": "abcdef1234567890/123;o=1"},
        )
    assert response.headers["X-Trace-Id"] == "abcdef1234567890"
    body = response.json()
    assert body["trace_id"] == "abcdef1234567890"


@pytest.mark.asyncio
async def test_middleware_sets_trace_in_contextvar():
    app = _make_app()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/test")
    body = response.json()
    # The endpoint returns the trace_id from the contextvar
    assert body["trace_id"] == response.headers["X-Trace-Id"]
