"""In-memory live OCR repositories for local development and tests."""

from __future__ import annotations

from dataclasses import dataclass, field
from threading import Lock
from uuid import uuid4

from packages.backend.fnd.domain.entities import utc_now
from packages.backend.fnd.domain.live import (
    LiveEventType,
    LiveSession,
    LiveSessionEvent,
    LiveSessionStatus,
)


@dataclass
class InMemoryLiveSessionRepository:
    _items: dict[str, LiveSession] = field(default_factory=dict)
    _lock: Lock = field(default_factory=Lock)

    def create(self, session: LiveSession) -> None:
        with self._lock:
            self._items[session.session_id] = session

    def save(self, session: LiveSession) -> None:
        with self._lock:
            self._items[session.session_id] = session

    def get(self, session_id: str) -> LiveSession | None:
        with self._lock:
            return self._items.get(session_id)


@dataclass
class InMemoryLiveSessionEventRepository:
    retention_limit: int = 1000
    _items: dict[str, list[LiveSessionEvent]] = field(default_factory=dict)
    _sequences: dict[str, int] = field(default_factory=dict)
    _lock: Lock = field(default_factory=Lock)

    def append(
        self,
        *,
        session_id: str,
        event_type: LiveEventType,
        status: LiveSessionStatus,
        message: str,
        metadata: dict[str, object] | None = None,
    ) -> LiveSessionEvent:
        with self._lock:
            sequence = self._sequences.get(session_id, 0) + 1
            self._sequences[session_id] = sequence
            event = LiveSessionEvent(
                event_id=str(uuid4()),
                session_id=session_id,
                sequence=sequence,
                event_type=event_type,
                status=status,
                message=message,
                timestamp=utc_now(),
                metadata=dict(metadata or {}),
            )
            events = self._items.setdefault(session_id, [])
            events.append(event)
            if len(events) > self.retention_limit:
                del events[: len(events) - self.retention_limit]
            return event

    def list_events(
        self,
        session_id: str,
        *,
        after_sequence: int = 0,
    ) -> list[LiveSessionEvent]:
        with self._lock:
            return [
                event
                for event in self._items.get(session_id, [])
                if event.sequence > after_sequence
            ]
