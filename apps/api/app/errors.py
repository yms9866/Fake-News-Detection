"""Stable API error handling."""

from __future__ import annotations

from logging import getLogger

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from packages.backend.fnd.domain.errors import FndError
from packages.contracts.python.analysis_contracts import ApiErrorResponse

from .middleware import get_request_id, get_trace_id

logger = getLogger(__name__)
VALIDATION_ERROR = "VALIDATION_ERROR"
INTERNAL_ERROR = "INTERNAL_ERROR"
ANALYSIS_NOT_FOUND = "ANALYSIS_NOT_FOUND"


def error_payload(
    request: Request,
    error_code: str,
    message: str,
    details: list[dict[str, object]] | None = None,
) -> ApiErrorResponse:
    return ApiErrorResponse(
        error_code=error_code,
        message=message,
        request_id=get_request_id(request),
        trace_id=get_trace_id(request),
        details=details or [],
    )


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(
        request: Request,
        exc: RequestValidationError,
    ) -> JSONResponse:
        details: list[dict[str, object]] = []
        for error in exc.errors():
            details.append(
                {
                    "loc": list(error.get("loc", ())),
                    "msg": str(error.get("msg", "validation error")),
                    "type": str(error.get("type", "value_error")),
                }
            )
        payload = error_payload(
            request=request,
            error_code=VALIDATION_ERROR,
            message="Request validation failed.",
            details=details,
        )
        return JSONResponse(
            status_code=422,
            content=payload.model_dump(mode="json"),
        )

    @app.exception_handler(FndError)
    async def fnd_exception_handler(request: Request, exc: FndError) -> JSONResponse:
        status_code = status.HTTP_400_BAD_REQUEST
        if exc.code == VALIDATION_ERROR:
            status_code = status.HTTP_422_UNPROCESSABLE_ENTITY
        elif exc.code == "MEDIA_TOO_LARGE":
            status_code = getattr(
                status,
                "HTTP_413_CONTENT_TOO_LARGE",
                getattr(status, "HTTP_413_REQUEST_ENTITY_TOO_LARGE", 413),
            )
        elif exc.code in {"JOB_NOT_FOUND", "LIVE_SESSION_NOT_FOUND"}:
            status_code = status.HTTP_404_NOT_FOUND
        elif exc.code == "LIVE_PERMISSION_DENIED":
            status_code = status.HTTP_403_FORBIDDEN
        payload = error_payload(
            request=request,
            error_code=exc.code,
            message=str(exc),
        )
        return JSONResponse(
            status_code=status_code,
            content=payload.model_dump(mode="json"),
        )

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(
        request: Request, exc: Exception
    ) -> JSONResponse:
        logger.exception("Unhandled API error: %s", exc)
        payload = error_payload(
            request=request,
            error_code=INTERNAL_ERROR,
            message="An internal error occurred while processing the request.",
        )
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=payload.model_dump(mode="json"),
        )
