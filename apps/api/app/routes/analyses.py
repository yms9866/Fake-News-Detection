"""Analysis endpoints."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from fastapi import APIRouter, Depends, Request, status
from fastapi.responses import JSONResponse

from apps.api.app.dependencies import get_analysis_repository, get_workflow
from apps.api.app.errors import ANALYSIS_NOT_FOUND, error_payload
from apps.api.app.middleware import get_request_id, get_trace_id
from apps.api.app.serializers import analysis_response_from_result
from apps.api.app.state import InMemoryAnalysisRepository
from packages.backend.fnd.application.workflows.analyze_content import (
    AnalyzeContentWorkflow,
)
from packages.backend.fnd.domain.entities import AnalyzeContentCommand
from packages.contracts.python.analysis_contracts import (
    ApiErrorResponse,
    AnalysisResponse,
    AnalyzeTextRequest,
    AnalyzeUrlRequest,
    PendingAnalysisResponse,
)

router = APIRouter(tags=["analyses"])

ERROR_RESPONSES: dict[int | str, dict[str, Any]] = {
    400: {"model": ApiErrorResponse},
    422: {"model": ApiErrorResponse},
    500: {"model": ApiErrorResponse},
}


@router.post(
    "/analyses/text",
    response_model=AnalysisResponse,
    responses=ERROR_RESPONSES,
)
def analyze_text(
    payload: AnalyzeTextRequest,
    request: Request,
    workflow: AnalyzeContentWorkflow = Depends(get_workflow),
    repository: InMemoryAnalysisRepository = Depends(get_analysis_repository),
) -> AnalysisResponse:
    created_at = datetime.now(timezone.utc)
    result = workflow.analyze(
        AnalyzeContentCommand(
            text=payload.text,
            deep_check=payload.deep_check,
            max_length=payload.max_length,
        )
    )
    completed_at = datetime.now(timezone.utc)
    response = analysis_response_from_result(
        result,
        analysis_id=str(uuid4()),
        request_id=get_request_id(request),
        trace_id=get_trace_id(request),
        created_at=created_at,
        completed_at=completed_at,
    )
    repository.save(response)
    return response


@router.post(
    "/analyses/url",
    response_model=AnalysisResponse,
    responses=ERROR_RESPONSES,
)
def analyze_url(
    payload: AnalyzeUrlRequest,
    request: Request,
    workflow: AnalyzeContentWorkflow = Depends(get_workflow),
    repository: InMemoryAnalysisRepository = Depends(get_analysis_repository),
) -> AnalysisResponse:
    created_at = datetime.now(timezone.utc)
    result = workflow.analyze(
        AnalyzeContentCommand(
            url=str(payload.url),
            deep_check=payload.deep_check,
            max_length=payload.max_length,
        )
    )
    completed_at = datetime.now(timezone.utc)
    response = analysis_response_from_result(
        result,
        analysis_id=str(uuid4()),
        request_id=get_request_id(request),
        trace_id=get_trace_id(request),
        created_at=created_at,
        completed_at=completed_at,
    )
    repository.save(response)
    return response


@router.get(
    "/analyses/{analysis_id}",
    response_model=AnalysisResponse | PendingAnalysisResponse,
    responses={**ERROR_RESPONSES, 404: {"model": ApiErrorResponse}},
)
def get_analysis(
    analysis_id: str,
    request: Request,
    repository: InMemoryAnalysisRepository = Depends(get_analysis_repository),
) -> AnalysisResponse | PendingAnalysisResponse | JSONResponse:
    response = repository.get(analysis_id)
    if response is None:
        payload = error_payload(
            request=request,
            error_code=ANALYSIS_NOT_FOUND,
            message="Analysis was not found.",
        )
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content=payload.model_dump(mode="json"),
        )

    return response
