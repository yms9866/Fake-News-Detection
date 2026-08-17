"""Asynchronous media analysis endpoints."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, File, Form, Request, UploadFile, status

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


@router.post(
    "/analyses/image",
    status_code=status.HTTP_202_ACCEPTED,
    response_model=MediaAnalysisAccepted,
    responses=ERROR_RESPONSES,
)
async def analyze_image(
    request: Request,
    file: UploadFile = File(...),
    deep_check: bool = Form(False),
    max_length: int | None = Form(None),
    service: MediaAnalysisSubmissionService = Depends(get_media_submission_service),
) -> MediaAnalysisAccepted:
    return await _submit_media(request, service, MediaType.IMAGE, file, deep_check, max_length)


@router.post(
    "/analyses/audio",
    status_code=status.HTTP_202_ACCEPTED,
    response_model=MediaAnalysisAccepted,
    responses=ERROR_RESPONSES,
)
async def analyze_audio(
    request: Request,
    file: UploadFile = File(...),
    deep_check: bool = Form(False),
    max_length: int | None = Form(None),
    service: MediaAnalysisSubmissionService = Depends(get_media_submission_service),
) -> MediaAnalysisAccepted:
    return await _submit_media(request, service, MediaType.AUDIO, file, deep_check, max_length)


@router.post(
    "/analyses/video",
    status_code=status.HTTP_202_ACCEPTED,
    response_model=MediaAnalysisAccepted,
    responses=ERROR_RESPONSES,
)
async def analyze_video(
    request: Request,
    file: UploadFile = File(...),
    deep_check: bool = Form(False),
    max_length: int | None = Form(None),
    service: MediaAnalysisSubmissionService = Depends(get_media_submission_service),
) -> MediaAnalysisAccepted:
    return await _submit_media(request, service, MediaType.VIDEO, file, deep_check, max_length)


async def _submit_media(
    request: Request,
    service: MediaAnalysisSubmissionService,
    media_type: MediaType,
    upload: UploadFile,
    deep_check: bool,
    max_length: int | None,
) -> MediaAnalysisAccepted:
    content = await upload.read()
    if not content:
        raise MediaValidationError("Missing multipart file field.", code=VALIDATION_ERROR)
    accepted = service.submit(
        MediaUploadCommand(
            media_type=media_type,
            content=content,
            original_filename=upload.filename or "upload",
            mime_type=upload.content_type or "application/octet-stream",
            deep_check=deep_check,
            max_length=_parse_max_length(max_length),
            endpoint=f"/v1/analyses/{media_type.value}",
            request_id=get_request_id(request),
            trace_id=get_trace_id(request),
            idempotency_key=request.headers.get("Idempotency-Key"),
        )
    )
    return media_accepted_response_from_domain(accepted)


def _parse_max_length(value: int | None) -> int | None:
    if value is None:
        return None
    if value < 128 or value > 8192:
        raise MediaValidationError(
            "max_length must be between 128 and 8192.",
            code=VALIDATION_ERROR,
        )
    return value
