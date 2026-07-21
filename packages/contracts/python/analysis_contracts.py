"""Shared Pydantic DTOs for analysis API requests and responses."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, HttpUrl, field_validator

AnalysisStatus = Literal["queued", "running", "completed", "failed", "cancelled"]
Quality = Literal["HIGH", "MEDIUM", "LOW"]
InputTypeCode = Literal["text", "url", "file", "unknown"]
StyleSignal = Literal["LOW_STYLE_RISK", "HIGH_STYLE_RISK", "UNKNOWN", "ERROR"]
MediaTypeCode = Literal["image", "audio", "video"]
ForensicSignalCode = Literal["NONE", "SUSPICIOUS", "INCONCLUSIVE", "ERROR"]
LiveSourceTypeCode = Literal["screen", "window", "region", "browser_tab"]
LiveSessionStatusCode = Literal[
    "created",
    "awaiting_permission",
    "capturing",
    "paused",
    "finalizing",
    "completed",
    "cancelled",
    "failed",
]
LiveEventTypeCode = Literal[
    "created",
    "indicator",
    "frame_accepted",
    "frame_skipped",
    "text_stabilized",
    "paused",
    "resumed",
    "stopped",
    "cancelled",
    "verified",
    "rate_limited",
    "failed",
]
LiveVerificationTriggerCode = Literal[
    "user",
    "stable_article",
    "idle",
    "url_change",
    "session_end",
]
JobStatusCode = Literal[
    "queued",
    "validating",
    "preprocessing",
    "extracting",
    "cleaning",
    "style_analysis",
    "searching",
    "fetching_evidence",
    "verifying",
    "deciding",
    "completed",
    "failed",
    "cancelled",
]


class ApiErrorResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    error_code: str
    message: str
    request_id: str
    trace_id: str
    details: list[dict[str, object]] = Field(default_factory=list)


class AnalyzeTextRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    text: str = Field(min_length=1, max_length=200_000)
    deep_check: bool = False
    max_length: int | None = Field(default=None, ge=128, le=8192)

    @field_validator("text")
    @classmethod
    def text_must_not_be_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("text must not be blank")
        return value


class AnalyzeUrlRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    url: HttpUrl
    deep_check: bool = False
    max_length: int | None = Field(default=None, ge=128, le=8192)


class MediaMetadata(BaseModel):
    model_config = ConfigDict(extra="forbid")

    media_type: MediaTypeCode
    mime_type: str
    size_bytes: int
    sha256: str


class ImageMetadata(MediaMetadata):
    width: int | None = None
    height: int | None = None
    format: str | None = None
    ocr_engine: str | None = None
    ocr_language: str | None = None
    ocr_confidence: float | None = None


class AudioMetadata(MediaMetadata):
    duration_seconds: float | None = None
    detected_language: str | None = None
    transcription_model: str | None = None
    segment_count: int | None = None


class VideoMetadata(MediaMetadata):
    duration_seconds: float | None = None
    width: int | None = None
    height: int | None = None
    frame_rate: float | None = None
    audio_transcribed: bool | None = None
    sampled_frame_count: int | None = None
    ocr_frame_count: int | None = None
    transcription_segment_count: int | None = None


class ExtractionMetadata(BaseModel):
    model_config = ConfigDict(extra="forbid")

    media_type: MediaTypeCode
    warnings: list[str] = Field(default_factory=list)
    channels: dict[str, Any] = Field(default_factory=dict)
    timings_ms: dict[str, float] = Field(default_factory=dict)


class MediaAnalysisAccepted(BaseModel):
    model_config = ConfigDict(extra="forbid")

    analysis_id: str
    job_id: str
    status: Literal["queued"]
    input_type: Literal["file"]
    media_type: MediaTypeCode
    status_url: str
    job_url: str
    events_url: str
    request_id: str
    trace_id: str


class JobError(BaseModel):
    model_config = ConfigDict(extra="forbid")

    code: str
    message: str
    retryable: bool = False


class JobResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    job_id: str
    analysis_id: str
    status: JobStatusCode
    progress: int = Field(ge=0, le=100)
    current_stage: JobStatusCode
    message: str
    created_at: datetime
    started_at: datetime | None = None
    updated_at: datetime
    completed_at: datetime | None = None
    error: JobError | None = None
    request_id: str
    trace_id: str


class JobProgressEvent(BaseModel):
    model_config = ConfigDict(extra="forbid")

    event_id: str
    job_id: str
    sequence: int
    status: JobStatusCode
    progress: int = Field(ge=0, le=100)
    message: str
    timestamp: datetime
    metadata: dict[str, Any] = Field(default_factory=dict)


class PendingAnalysisResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    analysis_id: str
    status: Literal["queued", "running", "failed", "cancelled"]
    input_type: Literal["file"]
    media_type: MediaTypeCode
    job_id: str
    error: JobError | None = None
    created_at: datetime
    completed_at: datetime | None = None
    request_id: str
    trace_id: str


class LiveRegion(BaseModel):
    model_config = ConfigDict(extra="forbid")

    x: int = Field(ge=0)
    y: int = Field(ge=0)
    width: int = Field(gt=0)
    height: int = Field(gt=0)


class LiveSessionSettings(BaseModel):
    model_config = ConfigDict(extra="forbid")

    capture_interval_ms: int = Field(default=1000, ge=250, le=10_000)
    perceptual_change_threshold: int = Field(default=4, ge=0, le=64)
    stability_required_frames: int = Field(default=1, ge=1, le=10)
    ocr_language: str = Field(default="eng", min_length=2, max_length=16)
    max_buffer_chars: int = Field(default=20_000, ge=500, le=200_000)
    max_events: int = Field(default=1000, ge=50, le=20_000)
    ai_cleaning_cooldown_seconds: int = Field(default=30, ge=1, le=3600)
    verification_cooldown_seconds: int = Field(default=60, ge=1, le=3600)
    max_session_duration_seconds: int = Field(default=3600, ge=60, le=86_400)


class CreateLiveSessionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    source_type: LiveSourceTypeCode
    source_id: str = Field(min_length=1, max_length=512)
    permission_granted: bool = False
    region: LiveRegion | None = None
    source_url: HttpUrl | None = None
    settings: LiveSessionSettings = Field(default_factory=LiveSessionSettings)

    @field_validator("source_id")
    @classmethod
    def source_id_must_not_be_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("source_id must not be blank")
        return value


class LiveOcrBlock(BaseModel):
    model_config = ConfigDict(extra="forbid")

    text: str = Field(default="", max_length=5000)
    confidence: float | None = Field(default=None, ge=0, le=1)
    bbox: LiveRegion | None = None


class SubmitLiveFrameRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    frame_id: str = Field(min_length=1, max_length=256)
    perceptual_hash: str = Field(min_length=1, max_length=256)
    ocr_text: str = Field(default="", max_length=100_000)
    ocr_blocks: list[LiveOcrBlock] = Field(default_factory=list)
    dom_text: str | None = Field(default=None, max_length=200_000)
    source_url: HttpUrl | None = None


class VerifyLiveSessionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    trigger: LiveVerificationTriggerCode = "user"
    deep_check: bool = False
    max_length: int | None = Field(default=None, ge=128, le=8192)
    force: bool = False


class LiveVerificationSnapshotResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    analysis_id: str
    trigger: LiveVerificationTriggerCode
    final_verdict: str
    confidence: Quality
    reason: str
    verified_at: datetime
    rate_limited: bool = False


class LiveSessionResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    session_id: str
    status: LiveSessionStatusCode
    source_type: LiveSourceTypeCode
    source_id: str
    region: LiveRegion | None = None
    source_url: str | None = None
    stable_text: str
    pending_text: str
    frame_count: int
    skipped_frame_count: int
    changed_frame_count: int
    buffer_chars: int
    visible_indicator_required: bool
    visible_indicator_active: bool
    frame_bytes_retained: bool
    ai_cleaning_call_count: int
    verification_count: int
    latest_verification: LiveVerificationSnapshotResponse | None = None
    created_at: datetime
    updated_at: datetime
    completed_at: datetime | None = None
    request_id: str
    trace_id: str


class LiveSessionEventResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    event_id: str
    session_id: str
    sequence: int
    event_type: LiveEventTypeCode
    status: LiveSessionStatusCode
    message: str
    timestamp: datetime
    metadata: dict[str, Any] = Field(default_factory=dict)


class EvidenceSummaryItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    url: str
    title: str = ""
    stance: str = "UNKNOWN"
    source_type: str = "UNKNOWN"
    reliability: Quality = "LOW"
    fetched: bool = False


class VerificationResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    verdict: str | None
    evidence_quality: Quality | None
    explanation: str
    recommendation: str
    evidence_summary: list[str] = Field(default_factory=list)
    evidence: list[EvidenceSummaryItem] = Field(default_factory=list)
    web_context: str | None = None
    error: str | None = None


class ForensicPluginResultResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    plugin_name: str
    plugin_version: str
    media_type: MediaTypeCode
    signal: ForensicSignalCode
    confidence: float | None = Field(default=None, ge=0, le=1)
    scope_reliable: bool
    evidence: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    model_version: str | None = None
    latency_ms: float | None = None
    failure_class: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class AnalysisResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    analysis_id: str
    status: AnalysisStatus
    input_type: InputTypeCode
    media_type: MediaTypeCode | None = None
    extracted_text: str
    cleaned_text: str
    source_url: str | None
    media_metadata: dict[str, Any] | None = None
    extraction_metadata: ExtractionMetadata | None = None
    style_signal: StyleSignal
    style_confidence: float | None
    style_scope_reliable: bool
    style_word_count: int
    style_minimum_word_count: int
    style_warning: str | None = None
    verification: VerificationResponse | None
    forensic_results: list[ForensicPluginResultResponse] = Field(default_factory=list)
    final_verdict: str
    confidence: Quality
    reason: str
    warnings: list[str] = Field(default_factory=list)
    created_at: datetime
    completed_at: datetime | None
    request_id: str
    trace_id: str


class MediaAnalysisResult(AnalysisResponse):
    input_type: Literal["file"]
    media_type: MediaTypeCode


class HealthResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: Literal["live", "ready", "degraded", "unready"]
    service: str = "fake-news-api"
    request_id: str
    trace_id: str


class ComponentStatus(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str
    status: Literal["ready", "configured", "missing", "disabled", "unloaded", "loaded"]
    detail: str = ""


class ReadinessResponse(HealthResponse):
    components: list[ComponentStatus] = Field(default_factory=list)


class ModelInfo(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str
    path: str
    exists: bool
    loaded: bool
    label_map: dict[int, str]
    max_length: int


class ModelsResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    models: list[ModelInfo]
    request_id: str
    trace_id: str


class ForensicPluginInfo(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str
    version: str
    supported_media_types: list[MediaTypeCode]
    required_capabilities: list[str] = Field(default_factory=list)
    enabled: bool
    ready: bool
    readiness_detail: str = ""
    model_version: str | None = None
    provider: str


class ForensicPluginsResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    plugins: list[ForensicPluginInfo] = Field(default_factory=list)
    request_id: str
    trace_id: str
