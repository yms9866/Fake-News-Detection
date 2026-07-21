"""Job status, cancellation, and progress-event endpoints."""

from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter, Depends, Query, Request, status
from fastapi.responses import JSONResponse, StreamingResponse

from apps.api.app.dependencies import (
    get_job_event_repository,
    get_job_repository,
    get_job_service,
)
from apps.api.app.errors import error_payload
from apps.api.app.serializers import (
    job_event_response_from_domain,
    job_response_from_domain,
)
from packages.backend.fnd.adapters.jobs.in_memory import (
    InMemoryJobEventRepository,
    InMemoryJobRepository,
)
from packages.backend.fnd.application.services.media_jobs import (
    MediaAnalysisJobService,
)
from packages.contracts.python.analysis_contracts import (
    ApiErrorResponse,
    JobResponse,
)

router = APIRouter(tags=["jobs"])

ERROR_RESPONSES: dict[int | str, dict[str, Any]] = {
    400: {"model": ApiErrorResponse},
    404: {"model": ApiErrorResponse},
    500: {"model": ApiErrorResponse},
}


@router.get(
    "/jobs/{job_id}",
    response_model=JobResponse,
    responses=ERROR_RESPONSES,
)
def get_job(
    job_id: str,
    request: Request,
    jobs: InMemoryJobRepository = Depends(get_job_repository),
) -> JobResponse | JSONResponse:
    job = jobs.get(job_id)
    if job is None:
        return _job_not_found(request)
    return job_response_from_domain(job)


@router.post(
    "/jobs/{job_id}/cancel",
    response_model=JobResponse,
    responses=ERROR_RESPONSES,
)
def cancel_job(
    job_id: str,
    request: Request,
    jobs: InMemoryJobRepository = Depends(get_job_repository),
    service: MediaAnalysisJobService = Depends(get_job_service),
) -> JobResponse | JSONResponse:
    if jobs.get(job_id) is None:
        return _job_not_found(request)
    job = service.cancel(job_id)
    return job_response_from_domain(job)


@router.get(
    "/jobs/{job_id}/events",
    response_model=None,
    responses={
        **ERROR_RESPONSES,
        200: {
            "content": {"text/event-stream": {"schema": {"type": "string"}}},
            "description": "Server-Sent Events stream of job progress.",
        },
    },
)
def get_job_events(
    job_id: str,
    request: Request,
    after_sequence: int = Query(default=0, ge=0),
    jobs: InMemoryJobRepository = Depends(get_job_repository),
    events: InMemoryJobEventRepository = Depends(get_job_event_repository),
) -> StreamingResponse | JSONResponse:
    if jobs.get(job_id) is None:
        return _job_not_found(request)

    event_payloads = [
        job_event_response_from_domain(event).model_dump(mode="json")
        for event in events.list_events(job_id, after_sequence=after_sequence)
    ]

    def stream_events():
        for payload in event_payloads:
            yield "event: progress\n"
            yield f"data: {json.dumps(payload, separators=(',', ':'))}\n\n"

    return StreamingResponse(
        stream_events(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache"},
    )


def _job_not_found(request: Request) -> JSONResponse:
    payload = error_payload(
        request=request,
        error_code="JOB_NOT_FOUND",
        message="Job was not found.",
    )
    return JSONResponse(
        status_code=status.HTTP_404_NOT_FOUND,
        content=payload.model_dump(mode="json"),
    )
