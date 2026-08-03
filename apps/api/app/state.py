"""API composition state and in-memory Slice 2 repositories."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from threading import Lock
from typing import Any, cast

from packages.backend.fnd.adapters.jobs.in_memory import (
    InMemoryIdempotencyRepository,
    InMemoryJobEventRepository,
    InMemoryJobRepository,
)
from packages.backend.fnd.adapters.jobs.in_process_queue import InProcessJobQueue
from packages.backend.fnd.adapters.live.in_memory import (
    InMemoryLiveSessionEventRepository,
    InMemoryLiveSessionRepository,
)
from packages.backend.fnd.adapters.persistence.in_memory_enterprise import (
    InMemoryAuditRepository,
    InMemoryDeviceRepository,
    InMemorySessionRepository,
    InMemorySessionTokenRepository,
)
from packages.backend.fnd.adapters.media.artifacts import TemporaryLocalArtifactStore
from packages.backend.fnd.adapters.media.preprocessors import LocalMediaPreprocessor
from packages.backend.fnd.adapters.media.probe import LocalMediaProbe
from packages.backend.fnd.application.services.forensics import ForensicPluginRegistry
from packages.backend.fnd.application.services.auth import (
    AuthService,
    LocalSessionAuthService,
)
from packages.backend.fnd.application.services.media_jobs import (
    MediaAnalysisJobService,
    MediaAnalysisSubmissionService,
)
from packages.backend.fnd.application.services.live_ocr import LiveOcrSessionService
from packages.backend.fnd.application.workflows.analyze_content import (
    AnalyzeContentWorkflow,
)
from packages.backend.fnd.config.settings import Settings
from packages.backend.fnd.domain.entities import AnalysisResult, utc_now
from packages.backend.fnd.domain.enums import MediaType
from packages.contracts.python.analysis_contracts import (
    AnalysisResponse,
    JobError,
    PendingAnalysisResponse,
)

from .serializers import analysis_response_from_result

AnalysisLookup = AnalysisResponse | PendingAnalysisResponse


@dataclass
class InMemoryAnalysisRepository:
    """Synchronous in-memory repository for completed and pending analyses."""

    _items: dict[str, AnalysisLookup] = field(default_factory=dict)
    _lock: Lock = field(default_factory=Lock)

    def save(self, response: AnalysisResponse) -> None:
        with self._lock:
            self._items[response.analysis_id] = response

    def get(self, analysis_id: str) -> AnalysisLookup | None:
        with self._lock:
            return self._items.get(analysis_id)

    def mark_queued(
        self,
        *,
        analysis_id: str,
        job_id: str,
        media_type: MediaType,
        request_id: str,
        trace_id: str,
    ) -> None:
        with self._lock:
            self._items[analysis_id] = PendingAnalysisResponse(
                analysis_id=analysis_id,
                status="queued",
                input_type="file",
                media_type=media_type.value,
                job_id=job_id,
                created_at=utc_now(),
                completed_at=None,
                request_id=request_id,
                trace_id=trace_id,
            )

    def save_result(
        self,
        *,
        analysis_id: str,
        result: AnalysisResult,
        request_id: str,
        trace_id: str,
    ) -> None:
        now = utc_now()
        with self._lock:
            existing = self._items.get(analysis_id)
            created_at: datetime = (
                existing.created_at
                if isinstance(existing, PendingAnalysisResponse)
                else now
            )
            self._items[analysis_id] = analysis_response_from_result(
                result,
                analysis_id=analysis_id,
                request_id=request_id,
                trace_id=trace_id,
                created_at=created_at,
                completed_at=now,
            )

    def mark_failed(
        self,
        *,
        analysis_id: str,
        error_code: str,
        message: str,
        request_id: str,
        trace_id: str,
    ) -> None:
        now = utc_now()
        with self._lock:
            existing = self._items.get(analysis_id)
            created_at: datetime = (
                existing.created_at
                if isinstance(existing, PendingAnalysisResponse)
                else now
            )
            job_id = (
                existing.job_id if isinstance(existing, PendingAnalysisResponse) else ""
            )
            media_type = (
                existing.media_type
                if isinstance(existing, PendingAnalysisResponse)
                else "image"
            )
            status = "cancelled" if error_code == "JOB_CANCELLED" else "failed"
            self._items[analysis_id] = PendingAnalysisResponse(
                analysis_id=analysis_id,
                status=cast(Any, status),
                input_type="file",
                media_type=cast(Any, media_type),
                job_id=job_id,
                error=JobError(code=error_code, message=message, retryable=False),
                created_at=created_at,
                completed_at=now,
                request_id=request_id,
                trace_id=trace_id,
            )


@dataclass(frozen=True)
class ModelRegistry:
    """Expose model configuration and load status without forcing a load."""

    model_path: Path
    max_length: int
    style_model: object

    def model_exists(self) -> bool:
        return self.model_path.exists()

    def is_loaded(self) -> bool:
        return bool(getattr(self.style_model, "_loaded", False))


@dataclass
class ApiContainer:
    settings: Settings
    workflow: AnalyzeContentWorkflow
    analyses: InMemoryAnalysisRepository
    model_registry: ModelRegistry
    jobs: InMemoryJobRepository | None = None
    job_events: InMemoryJobEventRepository | None = None
    idempotency: InMemoryIdempotencyRepository | None = None
    artifacts: TemporaryLocalArtifactStore | None = None
    media_probe: LocalMediaProbe | None = None
    media_preprocessor: LocalMediaPreprocessor | None = None
    job_service: MediaAnalysisJobService | None = None
    media_submission_service: MediaAnalysisSubmissionService | None = None
    job_queue: InProcessJobQueue | None = None
    live_sessions: InMemoryLiveSessionRepository | None = None
    live_events: InMemoryLiveSessionEventRepository | None = None
    live_service: LiveOcrSessionService | None = None
    forensic_plugins: ForensicPluginRegistry | None = None
    audit_repository: InMemoryAuditRepository | None = None
    device_repository: InMemoryDeviceRepository | None = None
    session_repository: InMemorySessionRepository | None = None
    token_repository: InMemorySessionTokenRepository | None = None
    auth_service: LocalSessionAuthService | None = None

    def __post_init__(self) -> None:
        self.forensic_plugins = self.forensic_plugins or ForensicPluginRegistry(
            default_timeout_seconds=self.settings.forensic_plugin_timeout_seconds,
            concurrency_limit=self.settings.forensic_plugin_concurrency,
        )
        if not self.settings.enable_forensic_plugins:
            for plugin in self.forensic_plugins.list_plugins():
                self.forensic_plugins.disable(plugin.metadata.name)
        self.audit_repository = self.audit_repository or InMemoryAuditRepository()
        self.device_repository = self.device_repository or InMemoryDeviceRepository()
        self.session_repository = self.session_repository or InMemorySessionRepository()
        self.token_repository = (
            self.token_repository or InMemorySessionTokenRepository()
        )
        assert self.audit_repository is not None
        assert self.device_repository is not None
        assert self.session_repository is not None
        assert self.token_repository is not None
        self.auth_service = self.auth_service or LocalSessionAuthService(
            auth=AuthService(
                sessions=self.session_repository,
                devices=self.device_repository,
                audit=self.audit_repository,
            ),
            sessions=self.session_repository,
            tokens=self.token_repository,
        )
        self.jobs = self.jobs or InMemoryJobRepository()
        self.job_events = self.job_events or InMemoryJobEventRepository(
            retention_limit=self.settings.job_event_retention_limit
        )
        self.idempotency = self.idempotency or InMemoryIdempotencyRepository()
        self.artifacts = self.artifacts or TemporaryLocalArtifactStore(
            self.settings.media_upload_directory
        )
        self.media_probe = self.media_probe or LocalMediaProbe(self.settings)
        self.media_preprocessor = self.media_preprocessor or LocalMediaPreprocessor(
            settings=self.settings
        )
        assert self.artifacts is not None
        assert self.jobs is not None
        assert self.job_events is not None
        assert self.media_preprocessor is not None
        assert self.forensic_plugins is not None
        self.job_service = self.job_service or MediaAnalysisJobService(
            settings=self.settings,
            workflow=self.workflow,
            artifacts=self.artifacts,
            jobs=self.jobs,
            events=self.job_events,
            analyses=self.analyses,
            media_preprocessor=self.media_preprocessor,
            forensic_plugins=self.forensic_plugins,
        )
        assert self.job_service is not None
        self.job_queue = self.job_queue or InProcessJobQueue(
            handler=self.job_service.execute,
            concurrency=self.settings.media_worker_concurrency,
        )
        self.live_sessions = self.live_sessions or InMemoryLiveSessionRepository()
        self.live_events = self.live_events or InMemoryLiveSessionEventRepository()
        assert self.idempotency is not None
        assert self.media_probe is not None
        assert self.job_queue is not None
        assert self.live_sessions is not None
        assert self.live_events is not None
        self.media_submission_service = (
            self.media_submission_service
            or MediaAnalysisSubmissionService(
                settings=self.settings,
                artifacts=self.artifacts,
                jobs=self.jobs,
                events=self.job_events,
                idempotency=self.idempotency,
                analyses=self.analyses,
                queue=self.job_queue,
                media_probe=self.media_probe,
            )
        )
        self.live_service = self.live_service or LiveOcrSessionService(
            sessions=self.live_sessions,
            events=self.live_events,
            workflow=self.workflow,
        )

    def start(self) -> None:
        if self.job_queue is not None:
            self.job_queue.start()

    def stop(self) -> None:
        if self.job_queue is not None:
            self.job_queue.stop()
        if self.forensic_plugins is not None:
            self.forensic_plugins.close()

    @classmethod
    def from_workflow(
        cls,
        settings: Settings,
        workflow: AnalyzeContentWorkflow,
    ) -> "ApiContainer":
        return cls(
            settings=settings,
            workflow=workflow,
            analyses=InMemoryAnalysisRepository(),
            model_registry=ModelRegistry(
                model_path=settings.modernbert_model_path,
                max_length=settings.max_length,
                style_model=workflow.style_model,
            ),
        )
