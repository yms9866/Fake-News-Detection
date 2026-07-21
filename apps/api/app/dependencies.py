"""FastAPI dependency helpers."""

from __future__ import annotations

from fastapi import Request

from packages.backend.fnd.application.workflows.analyze_content import (
    AnalyzeContentWorkflow,
)
from packages.backend.fnd.application.services.media_jobs import (
    MediaAnalysisJobService,
    MediaAnalysisSubmissionService,
)
from packages.backend.fnd.adapters.jobs.in_memory import (
    InMemoryJobEventRepository,
    InMemoryJobRepository,
)
from packages.backend.fnd.adapters.live.in_memory import (
    InMemoryLiveSessionEventRepository,
)
from packages.backend.fnd.application.services.live_ocr import LiveOcrSessionService

from .state import ApiContainer, InMemoryAnalysisRepository, ModelRegistry


def get_container(request: Request) -> ApiContainer:
    return request.app.state.container


def get_workflow(request: Request) -> AnalyzeContentWorkflow:
    return get_container(request).workflow


def get_analysis_repository(request: Request) -> InMemoryAnalysisRepository:
    return get_container(request).analyses


def get_model_registry(request: Request) -> ModelRegistry:
    return get_container(request).model_registry


def get_media_submission_service(request: Request) -> MediaAnalysisSubmissionService:
    service = get_container(request).media_submission_service
    assert service is not None
    return service


def get_job_service(request: Request) -> MediaAnalysisJobService:
    service = get_container(request).job_service
    assert service is not None
    return service


def get_job_repository(request: Request) -> InMemoryJobRepository:
    repository = get_container(request).jobs
    assert repository is not None
    return repository


def get_job_event_repository(request: Request) -> InMemoryJobEventRepository:
    repository = get_container(request).job_events
    assert repository is not None
    return repository


def get_live_service(request: Request) -> LiveOcrSessionService:
    service = get_container(request).live_service
    assert service is not None
    return service


def get_live_event_repository(request: Request) -> InMemoryLiveSessionEventRepository:
    repository = get_container(request).live_events
    assert repository is not None
    return repository
