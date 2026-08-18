"""Application service for privacy-preserving live OCR sessions."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import datetime
from difflib import SequenceMatcher
import re
from uuid import uuid4

from packages.backend.fnd.application.workflows.analyze_content import (
    AnalyzeContentWorkflow,
)
from packages.backend.fnd.domain.entities import (
    AnalysisResult,
    ExtractedDocument,
    normalize_text,
    utc_now,
)
from packages.backend.fnd.domain.enums import InputType
from packages.backend.fnd.domain.errors import FndError, JobNotFoundError
from packages.backend.fnd.domain.live import (
    LiveEventType,
    LiveFrame,
    LiveOcrBlock,
    LiveRegion,
    LiveSession,
    LiveSessionConfig,
    LiveSessionStatus,
    LiveSourceType,
    LiveVerificationSnapshot,
    LiveVerificationTrigger,
)
from packages.backend.fnd.ports.live import (
    LiveCoherenceCleaner,
    LiveSessionEventRepository,
    LiveSessionRepository,
)

LIVE_SOURCE_REQUIRED = "LIVE_SOURCE_REQUIRED"
LIVE_PERMISSION_DENIED = "LIVE_PERMISSION_DENIED"
LIVE_SESSION_NOT_FOUND = "LIVE_SESSION_NOT_FOUND"
LIVE_SESSION_NOT_CAPTURING = "LIVE_SESSION_NOT_CAPTURING"
LIVE_VERIFICATION_RATE_LIMITED = "LIVE_VERIFICATION_RATE_LIMITED"


@dataclass(frozen=True)
class CreateLiveSessionCommand:
    source_type: LiveSourceType
    source_id: str
    permission_granted: bool
    region: LiveRegion | None = None
    source_url: str | None = None
    config: LiveSessionConfig = field(default_factory=LiveSessionConfig)


@dataclass(frozen=True)
class SubmitLiveFrameCommand:
    session_id: str
    frame_id: str
    perceptual_hash: str
    ocr_text: str = ""
    ocr_blocks: tuple[LiveOcrBlock, ...] = ()
    dom_text: str | None = None
    source_url: str | None = None


@dataclass(frozen=True)
class VerifyLiveSessionCommand:
    session_id: str
    trigger: LiveVerificationTrigger
    deep_check: bool = False
    max_length: int | None = None
    force: bool = False


@dataclass(frozen=True)
class VerifyLiveSessionResult:
    session: LiveSession
    analysis: AnalysisResult | None = None


class RuleBasedLiveCoherenceCleaner:
    """Deterministic cleaner used before future AI coherence cleaning."""

    def clean(self, text: str) -> str:
        lines = [normalize_text(line) for line in re.split(r"[\r\n]+", text)]
        return normalize_text(" ".join(deduplicate_repeated_lines(lines)))


class NullLiveCoherenceCleaner:
    def clean(self, text: str) -> str:
        return normalize_text(text)


class LiveOcrSessionService:
    def __init__(
        self,
        *,
        sessions: LiveSessionRepository,
        events: LiveSessionEventRepository,
        workflow: AnalyzeContentWorkflow,
        cleaner: LiveCoherenceCleaner | None = None,
        clock: Callable[[], datetime] | None = None,
    ) -> None:
        self._sessions = sessions
        self._events = events
        self._workflow = workflow
        self._cleaner = cleaner or RuleBasedLiveCoherenceCleaner()
        self._clock = clock or utc_now

    def create(self, command: CreateLiveSessionCommand) -> LiveSession:
        if not command.source_id.strip():
            raise FndError(
                "Live capture requires an explicit source.", code=LIVE_SOURCE_REQUIRED
            )
        if not command.permission_granted:
            raise FndError(
                "Live capture permission was denied.",
                code=LIVE_PERMISSION_DENIED,
            )

        session = LiveSession(
            session_id=str(uuid4()),
            source_type=command.source_type,
            source_id=command.source_id.strip(),
            region=command.region,
            source_url=(
                command.source_url
                if command.source_type == LiveSourceType.BROWSER_TAB
                else None
            ),
            config=command.config,
        )
        session.transition(LiveSessionStatus.CAPTURING)
        self._sessions.create(session)
        self._event(
            session,
            LiveEventType.CREATED,
            "Live OCR session created.",
            {"source_type": session.source_type.value},
        )
        self._event(
            session,
            LiveEventType.INDICATOR,
            "Visible capture indicator is active.",
            {"visible_indicator_active": True},
        )
        return session

    def get(self, session_id: str) -> LiveSession:
        session = self._sessions.get(session_id)
        if session is None:
            raise JobNotFoundError(
                "Live session was not found.", code=LIVE_SESSION_NOT_FOUND
            )
        return session

    def pause(self, session_id: str) -> LiveSession:
        session = self.get(session_id)
        if session.status == LiveSessionStatus.CAPTURING:
            session.transition(LiveSessionStatus.PAUSED)
            self._sessions.save(session)
            self._event(session, LiveEventType.PAUSED, "Live OCR session paused.")
        return session

    def resume(self, session_id: str) -> LiveSession:
        session = self.get(session_id)
        if session.status == LiveSessionStatus.PAUSED:
            session.transition(LiveSessionStatus.CAPTURING)
            self._sessions.save(session)
            self._event(session, LiveEventType.RESUMED, "Live OCR session resumed.")
        return session

    def stop(self, session_id: str) -> LiveSession:
        session = self.get(session_id)
        if not session.terminal:
            if session.status != LiveSessionStatus.FINALIZING:
                session.transition(LiveSessionStatus.FINALIZING)
            session.transition(LiveSessionStatus.COMPLETED)
            self._sessions.save(session)
            self._event(session, LiveEventType.STOPPED, "Live OCR session stopped.")
        return session

    def cancel(self, session_id: str) -> LiveSession:
        session = self.get(session_id)
        if not session.terminal:
            session.transition(LiveSessionStatus.CANCELLED)
            session.stable_text = ""
            session.pending_text = ""
            session.frame_bytes_retained = False
            self._sessions.save(session)
            self._event(session, LiveEventType.CANCELLED, "Live OCR session cancelled.")
        return session

    def submit_frame(self, command: SubmitLiveFrameCommand) -> LiveSession:
        session = self.get(command.session_id)
        if session.status != LiveSessionStatus.CAPTURING:
            raise FndError(
                "Live session is not currently capturing.",
                code=LIVE_SESSION_NOT_CAPTURING,
            )

        frame = LiveFrame(
            frame_id=command.frame_id,
            perceptual_hash=command.perceptual_hash,
            ocr_text=command.ocr_text,
            ocr_blocks=command.ocr_blocks,
            dom_text=command.dom_text,
            source_url=command.source_url,
        )
        session.frame_count += 1
        session.last_frame_id = frame.frame_id
        if self._is_static_frame(session, frame.perceptual_hash):
            session.skipped_frame_count += 1
            session.frame_bytes_retained = False
            self._sessions.save(session)
            self._event(
                session,
                LiveEventType.FRAME_SKIPPED,
                "Frame skipped because perceptual change was below threshold.",
                {"frame_id": frame.frame_id},
            )
            return session

        session.changed_frame_count += 1
        session.last_perceptual_hash = frame.perceptual_hash
        candidate_text = self._extract_frame_text(session, frame)
        cleaned = rule_clean_live_text(candidate_text)
        self._stabilize(session, cleaned)
        session.frame_bytes_retained = False
        session.updated_at = self._now()
        self._sessions.save(session)
        self._event(
            session,
            LiveEventType.FRAME_ACCEPTED,
            "Frame OCR text accepted.",
            {"frame_id": frame.frame_id, "text_chars": len(cleaned)},
        )
        return session

    def verify(self, command: VerifyLiveSessionCommand) -> VerifyLiveSessionResult:
        session = self.get(command.session_id)
        if not normalize_text(session.stable_text):
            return VerifyLiveSessionResult(session=session)

        now = self._now()
        if (
            not command.force
            and session.last_verified_at is not None
            and (now - session.last_verified_at).total_seconds()
            < session.config.verification_cooldown_seconds
        ):
            self._event(
                session,
                LiveEventType.RATE_LIMITED,
                "Live OCR verification trigger was rate-limited.",
                {
                    "trigger": command.trigger.value,
                    "code": LIVE_VERIFICATION_RATE_LIMITED,
                },
            )
            return VerifyLiveSessionResult(session=session)

        document = ExtractedDocument(
            input_type=InputType.DIRECT_TEXT,
            text=session.stable_text,
            source=session.source_url,
            metadata={
                "live_session_id": session.session_id,
                "source_type": session.source_type.value,
                "url": session.source_url,
            },
        )
        result = self._workflow.analyze_document(
            document=document,
            deep_check=command.deep_check,
            max_length=command.max_length,
        )
        analysis_id = str(uuid4())
        session.latest_verification = LiveVerificationSnapshot(
            analysis_id=analysis_id,
            trigger=command.trigger,
            final_verdict=result.final.verdict.value,
            confidence=result.final.confidence.value,
            reason=result.final.reason,
            verified_at=now,
        )
        session.last_verified_at = now
        session.verification_count += 1
        session.updated_at = now
        self._sessions.save(session)
        self._event(
            session,
            LiveEventType.VERIFIED,
            "Live OCR buffer verified through the shared analysis workflow.",
            {
                "trigger": command.trigger.value,
                "analysis_id": analysis_id,
            },
        )
        return VerifyLiveSessionResult(session=session, analysis=result)

    def _stabilize(self, session: LiveSession, cleaned: str) -> None:
        if not cleaned:
            return
        if cleaned == session.pending_text:
            session.pending_count += 1
        else:
            session.pending_text = cleaned
            session.pending_count = 1

        if session.pending_count < session.config.stability_required_frames:
            return

        merged = merge_scroll_text(session.stable_text, cleaned)
        if merged != session.stable_text:
            session.stable_text = self._cap_buffer(
                merged, session.config.max_buffer_chars
            )
            self._maybe_clean(session)
            self._event(
                session,
                LiveEventType.TEXT_STABILIZED,
                "OCR text stabilized into the live buffer.",
                {"buffer_chars": len(session.stable_text)},
            )

    def _maybe_clean(self, session: LiveSession) -> None:
        now = self._now()
        if (
            session.last_ai_cleaned_at is not None
            and (now - session.last_ai_cleaned_at).total_seconds()
            < session.config.ai_cleaning_cooldown_seconds
        ):
            return
        session.stable_text = self._cleaner.clean(session.stable_text)
        session.last_ai_cleaned_at = now
        session.ai_cleaning_call_count += 1

    def _is_static_frame(self, session: LiveSession, next_hash: str) -> bool:
        if not session.last_perceptual_hash:
            return False
        return (
            perceptual_hash_distance(session.last_perceptual_hash, next_hash)
            <= session.config.perceptual_change_threshold
        )

    def _extract_frame_text(self, session: LiveSession, frame: LiveFrame) -> str:
        if session.source_type == LiveSourceType.BROWSER_TAB and frame.dom_text:
            session.source_url = frame.source_url or session.source_url
            return frame.dom_text
        block_text = " ".join(block.text for block in frame.ocr_blocks)
        return normalize_text(f"{frame.ocr_text} {block_text}")

    def _cap_buffer(self, text: str, max_chars: int) -> str:
        text = normalize_text(text)
        if len(text) <= max_chars:
            return text
        return text[-max_chars:].lstrip()

    def _event(
        self,
        session: LiveSession,
        event_type: LiveEventType,
        message: str,
        metadata: dict[str, object] | None = None,
    ) -> None:
        self._events.append(
            session_id=session.session_id,
            event_type=event_type,
            status=session.status,
            message=message,
            metadata=metadata,
        )

    def _now(self) -> datetime:
        return self._clock()


def perceptual_hash_distance(left: str, right: str) -> int:
    left_clean = normalize_text(left).lower()
    right_clean = normalize_text(right).lower()
    if not left_clean or not right_clean:
        return max(len(left_clean), len(right_clean))
    if len(left_clean) == len(right_clean) and all(
        c in "0123456789abcdef" for c in left_clean + right_clean
    ):
        try:
            return bin(int(left_clean, 16) ^ int(right_clean, 16)).count("1")
        except ValueError:
            pass
    size = max(len(left_clean), len(right_clean))
    return size - sum(
        1
        for left_char, right_char in zip(left_clean, right_clean)
        if left_char == right_char
    )


def rule_clean_live_text(text: str) -> str:
    cleaned = normalize_text(text)
    cleaned = re.sub(
        r"\b(skip ad|subscribe|cookie settings|accept cookies)\b",
        " ",
        cleaned,
        flags=re.IGNORECASE,
    )
    lines = re.split(r"(?<=[.!?])\s+", cleaned)
    return normalize_text(" ".join(deduplicate_repeated_lines(lines)))


def deduplicate_repeated_lines(lines: list[str]) -> list[str]:
    unique: list[str] = []
    for line in lines:
        cleaned = normalize_text(line)
        if not cleaned:
            continue
        if unique and _near_duplicate(cleaned, unique[-1]):
            continue
        unique.append(cleaned)
    return unique


def merge_scroll_text(existing: str, incoming: str) -> str:
    existing_clean = normalize_text(existing)
    incoming_clean = normalize_text(incoming)
    if not existing_clean:
        return incoming_clean
    if not incoming_clean or incoming_clean in existing_clean:
        return existing_clean

    existing_words = existing_clean.split()
    incoming_words = incoming_clean.split()
    max_overlap = min(len(existing_words), len(incoming_words), 80)
    for overlap in range(max_overlap, 0, -1):
        if existing_words[-overlap:] == incoming_words[:overlap]:
            return normalize_text(
                " ".join([*existing_words, *incoming_words[overlap:]])
            )
    return normalize_text(f"{existing_clean} {incoming_clean}")


def _near_duplicate(left: str, right: str, threshold: float = 0.92) -> bool:
    if left == right:
        return True
    return SequenceMatcher(a=left.lower(), b=right.lower()).ratio() >= threshold
