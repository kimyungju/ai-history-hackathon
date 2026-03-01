"""Trace ID middleware for request-scoped logging correlation.

Extracts trace ID from the ``X-Cloud-Trace-Context`` header (set by Cloud Run)
or generates a UUID. Stores it in ``trace_id_var`` for the request lifetime
and returns it in the ``X-Trace-Id`` response header.
"""

from __future__ import annotations

import uuid

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from app.config.logging_config import trace_id_var


class TraceMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        trace_header = request.headers.get("X-Cloud-Trace-Context", "")
        if trace_header:
            trace_id = trace_header.split("/")[0]
        else:
            trace_id = uuid.uuid4().hex

        token = trace_id_var.set(trace_id)
        try:
            response: Response = await call_next(request)
            response.headers["X-Trace-Id"] = trace_id
            return response
        finally:
            trace_id_var.reset(token)
