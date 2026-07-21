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
