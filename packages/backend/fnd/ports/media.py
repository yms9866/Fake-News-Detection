"""Ports for asynchronous media analysis."""

from __future__ import annotations

from typing import Protocol

from packages.backend.fnd.domain.entities import AnalysisResult, ExtractedDocument
from packages.backend.fnd.domain.enums import JobStatus, MediaType
from packages.backend.fnd.domain.media import (
    AnalysisJob,
    ExtractionMetadata,
    JobProgressEvent,
    MediaAnalysisAccepted,
    MediaAnalysisJobCommand,
    MediaMetadata,
    StoredArtifact,
)


class CancellationToken(Protocol):
    def throw_if_cancelled(self) -> None: ...


class JobQueue(Protocol):
    def start(self) -> None: ...

    def stop(self) -> None: ...

    def enqueue(self, command: MediaAnalysisJobCommand) -> None: ...


class JobRepository(Protocol):
    def create(self, job: AnalysisJob) -> None: ...

    def save(self, job: AnalysisJob) -> None: ...

    def get(self, job_id: str) -> AnalysisJob | None: ...

    def find_by_analysis_id(self, analysis_id: str) -> AnalysisJob | None: ...


class JobEventRepository(Protocol):
    def append(
        self,
        *,
        job_id: str,
        status: JobStatus,
        progress: int,
        message: str,
        metadata: dict[str, object] | None = None,
    ) -> JobProgressEvent: ...

    def list_events(
        self,
        job_id: str,
        *,
        after_sequence: int = 0,
    ) -> list[JobProgressEvent]: ...


class ArtifactStore(Protocol):
    def save(
        self,
        *,
        media_type: MediaType,
        content: bytes,
        original_filename: str,
        mime_type: str,
    ) -> StoredArtifact: ...

    def get(self, artifact_id: str) -> StoredArtifact | None: ...

    def delete(self, artifact_id: str) -> None: ...


class MediaProbe(Protocol):
    def probe(self, artifact: StoredArtifact) -> MediaMetadata: ...

    def capabilities(self) -> dict[str, object]: ...


class MediaPreprocessor(Protocol):
    def extract(
        self,
        artifact: StoredArtifact,
        metadata: MediaMetadata,
        cancellation: CancellationToken,
    ) -> tuple[ExtractedDocument, ExtractionMetadata]: ...

    def capabilities(self) -> dict[str, object]: ...


class IdempotencyRepository(Protocol):
    def get(
        self,
        *,
        client_context: str,
        endpoint: str,
        key: str,
    ) -> tuple[str, MediaAnalysisAccepted] | None: ...

    def save(
        self,
        *,
        client_context: str,
        endpoint: str,
        key: str,
        content_hash: str,
        accepted: MediaAnalysisAccepted,
    ) -> None: ...


class AnalysisResultRepository(Protocol):
    def mark_queued(
        self,
        *,
        analysis_id: str,
        job_id: str,
        media_type: MediaType,
        request_id: str,
        trace_id: str,
    ) -> None: ...

    def save_result(
        self,
        *,
        analysis_id: str,
        result: AnalysisResult,
        request_id: str,
        trace_id: str,
    ) -> None: ...

    def mark_failed(
        self,
        *,
        analysis_id: str,
        error_code: str,
        message: str,
        request_id: str,
        trace_id: str,
    ) -> None: ...
