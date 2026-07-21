"""Domain entities for privacy-preserving live OCR sessions."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any

from packages.backend.fnd.domain.entities import utc_now
from packages.backend.fnd.domain.errors import JobStateError


class LiveSourceType(str, Enum):
    SCREEN = "screen"
    WINDOW = "window"
    REGION = "region"
    BROWSER_TAB = "browser_tab"


class LiveSessionStatus(str, Enum):
    CREATED = "created"
    AWAITING_PERMISSION = "awaiting_permission"
    CAPTURING = "capturing"
    PAUSED = "paused"
    FINALIZING = "finalizing"
    COMPLETED = "completed"
    CANCELLED = "cancelled"
    FAILED = "failed"

    @property
    def terminal(self) -> bool:
        return self in {
            LiveSessionStatus.COMPLETED,
            LiveSessionStatus.CANCELLED,
            LiveSessionStatus.FAILED,
        }


class LiveEventType(str, Enum):
    CREATED = "created"
    INDICATOR = "indicator"
    FRAME_ACCEPTED = "frame_accepted"
    FRAME_SKIPPED = "frame_skipped"
    TEXT_STABILIZED = "text_stabilized"
    PAUSED = "paused"
    RESUMED = "resumed"
    STOPPED = "stopped"
    CANCELLED = "cancelled"
    VERIFIED = "verified"
    RATE_LIMITED = "rate_limited"
    FAILED = "failed"


class LiveVerificationTrigger(str, Enum):
    USER = "user"
    STABLE_ARTICLE = "stable_article"
    IDLE = "idle"
    URL_CHANGE = "url_change"
    SESSION_END = "session_end"


ALLOWED_LIVE_TRANSITIONS: dict[LiveSessionStatus, set[LiveSessionStatus]] = {
    LiveSessionStatus.CREATED: {
        LiveSessionStatus.AWAITING_PERMISSION,
        LiveSessionStatus.CAPTURING,
        LiveSessionStatus.CANCELLED,
        LiveSessionStatus.FAILED,
    },
    LiveSessionStatus.AWAITING_PERMISSION: {
        LiveSessionStatus.CAPTURING,
        LiveSessionStatus.CANCELLED,
        LiveSessionStatus.FAILED,
    },
    LiveSessionStatus.CAPTURING: {
        LiveSessionStatus.PAUSED,
        LiveSessionStatus.FINALIZING,
        LiveSessionStatus.CANCELLED,
        LiveSessionStatus.FAILED,
    },
    LiveSessionStatus.PAUSED: {
        LiveSessionStatus.CAPTURING,
        LiveSessionStatus.FINALIZING,
        LiveSessionStatus.CANCELLED,
        LiveSessionStatus.FAILED,
    },
    LiveSessionStatus.FINALIZING: {
        LiveSessionStatus.COMPLETED,
        LiveSessionStatus.CANCELLED,
        LiveSessionStatus.FAILED,
    },
    LiveSessionStatus.COMPLETED: set(),
    LiveSessionStatus.CANCELLED: set(),
    LiveSessionStatus.FAILED: set(),
}


@dataclass(frozen=True)
class LiveRegion:
    x: int
    y: int
    width: int
    height: int


@dataclass(frozen=True)
class LiveOcrBlock:
    text: str
    confidence: float | None = None
    bbox: LiveRegion | None = None


@dataclass(frozen=True)
class LiveSessionConfig:
    capture_interval_ms: int = 1000
    perceptual_change_threshold: int = 4
    stability_required_frames: int = 1
    ocr_language: str = "eng"
    max_buffer_chars: int = 20_000
    max_events: int = 1000
    ai_cleaning_cooldown_seconds: int = 30
    verification_cooldown_seconds: int = 60
    max_session_duration_seconds: int = 3600


@dataclass(frozen=True)
class LiveFrame:
    frame_id: str
    perceptual_hash: str
    ocr_text: str = ""
    ocr_blocks: tuple[LiveOcrBlock, ...] = ()
    dom_text: str | None = None
    source_url: str | None = None
    captured_at: datetime = field(default_factory=utc_now)
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class LiveVerificationSnapshot:
    analysis_id: str
    trigger: LiveVerificationTrigger
    final_verdict: str
    confidence: str
    reason: str
    verified_at: datetime = field(default_factory=utc_now)
    rate_limited: bool = False


@dataclass
class LiveSession:
    session_id: str
    source_type: LiveSourceType
    source_id: str
    status: LiveSessionStatus = LiveSessionStatus.CREATED
    region: LiveRegion | None = None
    source_url: str | None = None
    config: LiveSessionConfig = field(default_factory=LiveSessionConfig)
    stable_text: str = ""
    pending_text: str = ""
    pending_count: int = 0
    last_perceptual_hash: str | None = None
    last_frame_id: str | None = None
    frame_count: int = 0
    skipped_frame_count: int = 0
    changed_frame_count: int = 0
    ai_cleaning_call_count: int = 0
    verification_count: int = 0
    latest_verification: LiveVerificationSnapshot | None = None
    created_at: datetime = field(default_factory=utc_now)
    updated_at: datetime = field(default_factory=utc_now)
    completed_at: datetime | None = None
    last_ai_cleaned_at: datetime | None = None
    last_verified_at: datetime | None = None
    visible_indicator_required: bool = True
    visible_indicator_active: bool = False
    frame_bytes_retained: bool = False
    error: str | None = None

    @property
    def terminal(self) -> bool:
        return self.status.terminal

    def transition(self, status: LiveSessionStatus) -> None:
        if (
            status != self.status
            and status not in ALLOWED_LIVE_TRANSITIONS[self.status]
        ):
            raise JobStateError(
                f"Cannot transition live session from {self.status.value} to {status.value}."
            )
        self.status = status
        self.updated_at = utc_now()
        if status.terminal:
            self.completed_at = self.updated_at
        if status == LiveSessionStatus.CAPTURING:
            self.visible_indicator_active = True
        if status.terminal or status == LiveSessionStatus.PAUSED:
            self.visible_indicator_active = False


@dataclass(frozen=True)
class LiveSessionEvent:
    event_id: str
    session_id: str
    sequence: int
    event_type: LiveEventType
    status: LiveSessionStatus
    message: str
    timestamp: datetime
    metadata: dict[str, Any] = field(default_factory=dict)
