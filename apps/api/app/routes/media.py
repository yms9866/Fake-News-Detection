"""Asynchronous media analysis endpoints."""

from __future__ import annotations

from dataclasses import dataclass
from email import policy
from email.parser import BytesParser
from typing import Any

from fastapi import APIRouter, Depends, Request, status

from apps.api.app.dependencies import get_media_submission_service
from apps.api.app.errors import VALIDATION_ERROR
from apps.api.app.middleware import get_request_id, get_trace_id
from apps.api.app.serializers import media_accepted_response_from_domain
from packages.backend.fnd.application.services.media_jobs import (
    MediaAnalysisSubmissionService,
    MediaUploadCommand,
)
from packages.backend.fnd.domain.enums import MediaType
from packages.backend.fnd.domain.errors import MediaValidationError
from packages.contracts.python.analysis_contracts import (
    ApiErrorResponse,
    MediaAnalysisAccepted,
)

router = APIRouter(tags=["media analyses"])

ERROR_RESPONSES: dict[int | str, dict[str, Any]] = {
    400: {"model": ApiErrorResponse},
    413: {"model": ApiErrorResponse},
    422: {"model": ApiErrorResponse},
    500: {"model": ApiErrorResponse},
}

MULTIPART_REQUEST_BODY = {
    "requestBody": {
        "required": True,
        "content": {
            "multipart/form-data": {
                "schema": {
                    "type": "object",
                    "required": ["file"],
                    "properties": {
                        "file": {"type": "string", "format": "binary"},
                        "deep_check": {"type": "boolean", "default": False},
                        "max_length": {
                            "type": "integer",
                            "minimum": 128,
                            "maximum": 8192,
                        },
                    },
                }
            }
        },
    }
}


@dataclass(frozen=True)
class ParsedUpload:
    content: bytes
    filename: str
    mime_type: str
    deep_check: bool
    max_length: int | None


@router.post(
    "/analyses/image",
    status_code=status.HTTP_202_ACCEPTED,
    response_model=MediaAnalysisAccepted,
    responses=ERROR_RESPONSES,
    openapi_extra=MULTIPART_REQUEST_BODY,
)
async def analyze_image(
    request: Request,
    service: MediaAnalysisSubmissionService = Depends(get_media_submission_service),
) -> MediaAnalysisAccepted:
    return await _submit_media(request, service, MediaType.IMAGE)


@router.post(
    "/analyses/audio",
    status_code=status.HTTP_202_ACCEPTED,
    response_model=MediaAnalysisAccepted,
    responses=ERROR_RESPONSES,
    openapi_extra=MULTIPART_REQUEST_BODY,
)
async def analyze_audio(
    request: Request,
    service: MediaAnalysisSubmissionService = Depends(get_media_submission_service),
) -> MediaAnalysisAccepted:
    return await _submit_media(request, service, MediaType.AUDIO)


@router.post(
    "/analyses/video",
    status_code=status.HTTP_202_ACCEPTED,
    response_model=MediaAnalysisAccepted,
    responses=ERROR_RESPONSES,
    openapi_extra=MULTIPART_REQUEST_BODY,
)
async def analyze_video(
    request: Request,
    service: MediaAnalysisSubmissionService = Depends(get_media_submission_service),
) -> MediaAnalysisAccepted:
    return await _submit_media(request, service, MediaType.VIDEO)


async def _submit_media(
    request: Request,
    service: MediaAnalysisSubmissionService,
    media_type: MediaType,
) -> MediaAnalysisAccepted:
    parsed = await _parse_multipart_upload(request)
    accepted = service.submit(
        MediaUploadCommand(
            media_type=media_type,
            content=parsed.content,
            original_filename=parsed.filename,
            mime_type=parsed.mime_type,
            deep_check=parsed.deep_check,
            max_length=parsed.max_length,
            endpoint=f"/v1/analyses/{media_type.value}",
            request_id=get_request_id(request),
            trace_id=get_trace_id(request),
            idempotency_key=request.headers.get("Idempotency-Key"),
        )
    )
    return media_accepted_response_from_domain(accepted)


async def _parse_multipart_upload(request: Request) -> ParsedUpload:
    content_type = request.headers.get("content-type", "")
    if "multipart/form-data" not in content_type.lower():
        raise MediaValidationError(
            "Media endpoints require multipart/form-data.",
            code=VALIDATION_ERROR,
        )

    body = await request.body()
    message = BytesParser(policy=policy.default).parsebytes(
        f"Content-Type: {content_type}\r\nMIME-Version: 1.0\r\n\r\n".encode("utf-8")
        + body
    )
    if not message.is_multipart():
        raise MediaValidationError(
            "Multipart request body could not be parsed.",
            code=VALIDATION_ERROR,
        )

    file_content: bytes | None = None
    filename = "upload"
    mime_type = "application/octet-stream"
    fields: dict[str, str] = {}

    for part in message.iter_parts():
        disposition = part.get("Content-Disposition", "")
        if "form-data" not in disposition:
            continue
        raw_params = part.get_params(header="content-disposition") or []
        params = dict(raw_params[1:])
        name = str(params.get("name", ""))
        raw_payload = part.get_payload(decode=True)
        payload = raw_payload if isinstance(raw_payload, bytes) else b""
        if name == "file":
            file_content = payload
            filename = str(params.get("filename", "upload"))
            mime_type = part.get_content_type()
        elif name:
            fields[name] = payload.decode("utf-8", errors="ignore").strip()

    if file_content is None:
        raise MediaValidationError(
            "Missing multipart file field.", code=VALIDATION_ERROR
        )

    return ParsedUpload(
        content=file_content,
        filename=filename,
        mime_type=mime_type,
        deep_check=_parse_bool(fields.get("deep_check", "false")),
        max_length=_parse_max_length(fields.get("max_length")),
    )


def _parse_bool(value: str) -> bool:
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _parse_max_length(value: str | None) -> int | None:
    if value is None or not value.strip():
        return None
    try:
        parsed = int(value)
    except ValueError as exc:
        raise MediaValidationError(
            "max_length must be an integer.", code=VALIDATION_ERROR
        ) from exc
    if parsed < 128 or parsed > 8192:
        raise MediaValidationError(
            "max_length must be between 128 and 8192.",
            code=VALIDATION_ERROR,
        )
    return parsed
