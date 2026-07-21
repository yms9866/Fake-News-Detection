"""Request context middleware."""

from __future__ import annotations

from uuid import uuid4

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

REQUEST_ID_HEADER = "X-Request-ID"
TRACE_ID_HEADER = "X-Trace-ID"


class RequestContextMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        request_id = request.headers.get(REQUEST_ID_HEADER) or str(uuid4())
        trace_id = request.headers.get(TRACE_ID_HEADER) or str(uuid4())

        request.state.request_id = request_id
        request.state.trace_id = trace_id

        response = await call_next(request)
        response.headers[REQUEST_ID_HEADER] = request_id
        response.headers[TRACE_ID_HEADER] = trace_id
        return response


def get_request_id(request: Request) -> str:
    return getattr(request.state, "request_id", "")


def get_trace_id(request: Request) -> str:
    return getattr(request.state, "trace_id", "")
