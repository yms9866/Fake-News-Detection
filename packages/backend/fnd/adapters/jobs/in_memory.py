"""In-memory Slice 3 job repositories."""

from __future__ import annotations

from dataclasses import dataclass, field
from threading import Lock
from uuid import uuid4

from packages.backend.fnd.domain.entities import utc_now
from packages.backend.fnd.domain.enums import JobStatus
from packages.backend.fnd.domain.media import (
    AnalysisJob,
    JobProgressEvent,
    MediaAnalysisAccepted,
)


@dataclass
class InMemoryJobRepository:
    _items: dict[str, AnalysisJob] = field(default_factory=dict)
    _lock: Lock = field(default_factory=Lock)

    def create(self, job: AnalysisJob) -> None:
        with self._lock:
            self._items[job.job_id] = job

    def save(self, job: AnalysisJob) -> None:
        with self._lock:
            self._items[job.job_id] = job

    def get(self, job_id: str) -> AnalysisJob | None:
        with self._lock:
            return self._items.get(job_id)

    def find_by_analysis_id(self, analysis_id: str) -> AnalysisJob | None:
        with self._lock:
            for job in self._items.values():
                if job.analysis_id == analysis_id:
                    return job
            return None


@dataclass
class InMemoryJobEventRepository:
    retention_limit: int = 500
    _items: dict[str, list[JobProgressEvent]] = field(default_factory=dict)
    _sequences: dict[str, int] = field(default_factory=dict)
    _lock: Lock = field(default_factory=Lock)

    def append(
        self,
        *,
        job_id: str,
        status: JobStatus,
        progress: int,
        message: str,
        metadata: dict[str, object] | None = None,
    ) -> JobProgressEvent:
        with self._lock:
            sequence = self._sequences.get(job_id, 0) + 1
            self._sequences[job_id] = sequence
            event = JobProgressEvent(
                event_id=str(uuid4()),
                job_id=job_id,
                sequence=sequence,
                status=status,
                progress=progress,
                message=message,
                timestamp=utc_now(),
                metadata=dict(metadata or {}),
            )
            events = self._items.setdefault(job_id, [])
            events.append(event)
            if len(events) > self.retention_limit:
                del events[: len(events) - self.retention_limit]
            return event

    def list_events(
        self,
        job_id: str,
        *,
        after_sequence: int = 0,
    ) -> list[JobProgressEvent]:
        with self._lock:
            return [
                event
                for event in self._items.get(job_id, [])
                if event.sequence > after_sequence
            ]


@dataclass
class InMemoryIdempotencyRepository:
    _items: dict[tuple[str, str, str], tuple[str, MediaAnalysisAccepted]] = field(
        default_factory=dict
    )
    _lock: Lock = field(default_factory=Lock)

    def get(
        self,
        *,
        client_context: str,
        endpoint: str,
        key: str,
    ) -> tuple[str, MediaAnalysisAccepted] | None:
        with self._lock:
            return self._items.get((client_context, endpoint, key))

    def save(
        self,
        *,
        client_context: str,
        endpoint: str,
        key: str,
        content_hash: str,
        accepted: MediaAnalysisAccepted,
    ) -> None:
        with self._lock:
            self._items[(client_context, endpoint, key)] = (content_hash, accepted)
