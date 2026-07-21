"""Media and asynchronous job domain entities."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any

from packages.backend.fnd.domain.entities import utc_now
from packages.backend.fnd.domain.enums import InputType, JobStatus, MediaType
from packages.backend.fnd.domain.errors import JobStateError

TERMINAL_JOB_STATUSES = {
    JobStatus.COMPLETED,
    JobStatus.FAILED,
    JobStatus.CANCELLED,
}

ALLOWED_JOB_TRANSITIONS: dict[JobStatus, set[JobStatus]] = {
    JobStatus.QUEUED: {JobStatus.VALIDATING, JobStatus.CANCELLED},
    JobStatus.VALIDATING: {
        JobStatus.PREPROCESSING,
        JobStatus.FAILED,
        JobStatus.CANCELLED,
    },
    JobStatus.PREPROCESSING: {
        JobStatus.EXTRACTING,
        JobStatus.FAILED,
        JobStatus.CANCELLED,
    },
    JobStatus.EXTRACTING: {
        JobStatus.CLEANING,
        JobStatus.FAILED,
        JobStatus.CANCELLED,
    },
    JobStatus.CLEANING: {
        JobStatus.STYLE_ANALYSIS,
        JobStatus.FAILED,
        JobStatus.CANCELLED,
    },
    JobStatus.STYLE_ANALYSIS: {
        JobStatus.SEARCHING,
        JobStatus.DECIDING,
        JobStatus.FAILED,
        JobStatus.CANCELLED,
    },
    JobStatus.SEARCHING: {
        JobStatus.FETCHING_EVIDENCE,
        JobStatus.VERIFYING,
        JobStatus.FAILED,
        JobStatus.CANCELLED,
    },
    JobStatus.FETCHING_EVIDENCE: {
        JobStatus.VERIFYING,
        JobStatus.FAILED,
        JobStatus.CANCELLED,
    },
    JobStatus.VERIFYING: {
        JobStatus.DECIDING,
        JobStatus.FAILED,
        JobStatus.CANCELLED,
    },
    JobStatus.DECIDING: {
        JobStatus.COMPLETED,
        JobStatus.FAILED,
        JobStatus.CANCELLED,
    },
    JobStatus.COMPLETED: set(),
    JobStatus.FAILED: set(),
    JobStatus.CANCELLED: set(),
}


@dataclass(frozen=True)
class JobError:
    code: str
    message: str
    retryable: bool = False


@dataclass(frozen=True)
class StoredArtifact:
    artifact_id: str
    media_type: MediaType
    path: Path
    original_filename: str
    sanitized_filename: str
    mime_type: str
    size_bytes: int
    sha256: str
    created_at: datetime = field(default_factory=utc_now)


@dataclass(frozen=True)
class MediaMetadata:
    media_type: MediaType
    mime_type: str
    size_bytes: int
    sha256: str
    details: dict[str, Any] = field(default_factory=dict)

    def public_dict(self) -> dict[str, Any]:
        return {
            "media_type": self.media_type.value,
            "mime_type": self.mime_type,
            "size_bytes": self.size_bytes,
            "sha256": self.sha256,
            **self.details,
        }


@dataclass(frozen=True)
class ExtractionMetadata:
    media_type: MediaType
    warnings: tuple[str, ...] = ()
    channels: dict[str, Any] = field(default_factory=dict)
    timings_ms: dict[str, float] = field(default_factory=dict)

    def public_dict(self) -> dict[str, Any]:
        return {
            "media_type": self.media_type.value,
            "warnings": list(self.warnings),
            "channels": self.channels,
            "timings_ms": self.timings_ms,
        }


@dataclass
class AnalysisJob:
    job_id: str
    analysis_id: str
    artifact_id: str
    media_type: MediaType
    status: JobStatus = JobStatus.QUEUED
    progress: int = 0
    current_stage: str = JobStatus.QUEUED.value
    message: str = "Queued"
    input_type: InputType = InputType.FILE
    created_at: datetime = field(default_factory=utc_now)
    started_at: datetime | None = None
    updated_at: datetime = field(default_factory=utc_now)
    completed_at: datetime | None = None
    error: JobError | None = None
    request_id: str = ""
    trace_id: str = ""
    cancel_requested: bool = False
    media_metadata: MediaMetadata | None = None

    @property
    def terminal(self) -> bool:
        return self.status in TERMINAL_JOB_STATUSES

    def request_cancel(self) -> None:
        self.cancel_requested = True
        self.updated_at = utc_now()

    def transition(
        self,
        status: JobStatus,
        *,
        progress: int | None = None,
        message: str | None = None,
        error: JobError | None = None,
    ) -> None:
        if status != self.status and status not in ALLOWED_JOB_TRANSITIONS[self.status]:
            raise JobStateError(
                f"Cannot transition job from {self.status.value} to {status.value}."
            )

        now = utc_now()
        if self.started_at is None and status != JobStatus.QUEUED:
            self.started_at = now

        self.status = status
        self.current_stage = status.value
        if progress is not None:
            self.progress = max(0, min(100, progress))
        if message is not None:
            self.message = message
        self.error = error
        self.updated_at = now
        if status in TERMINAL_JOB_STATUSES:
            self.completed_at = now


@dataclass(frozen=True)
class JobProgressEvent:
    event_id: str
    job_id: str
    sequence: int
    status: JobStatus
    progress: int
    message: str
    timestamp: datetime
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class MediaAnalysisJobCommand:
    job_id: str
    analysis_id: str
    artifact_id: str
    deep_check: bool
    max_length: int | None
    request_id: str
    trace_id: str


@dataclass(frozen=True)
class MediaAnalysisAccepted:
    analysis_id: str
    job_id: str
    status: JobStatus
    input_type: InputType
    media_type: MediaType
    request_id: str
    trace_id: str
