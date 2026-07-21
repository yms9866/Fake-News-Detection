"""Ports for live OCR session storage and optional cleaning."""

from __future__ import annotations

from typing import Protocol

from packages.backend.fnd.domain.live import (
    LiveEventType,
    LiveSession,
    LiveSessionEvent,
    LiveSessionStatus,
)


class LiveSessionRepository(Protocol):
    def create(self, session: LiveSession) -> None: ...

    def save(self, session: LiveSession) -> None: ...

    def get(self, session_id: str) -> LiveSession | None: ...


class LiveSessionEventRepository(Protocol):
    def append(
        self,
        *,
        session_id: str,
        event_type: LiveEventType,
        status: LiveSessionStatus,
        message: str,
        metadata: dict[str, object] | None = None,
    ) -> LiveSessionEvent: ...

    def list_events(
        self,
        session_id: str,
        *,
        after_sequence: int = 0,
    ) -> list[LiveSessionEvent]: ...


class LiveCoherenceCleaner(Protocol):
    def clean(self, text: str) -> str: ...
