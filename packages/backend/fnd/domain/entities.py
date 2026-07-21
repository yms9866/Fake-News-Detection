"""Core domain entities for analysis and evidence policy."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .enums import (
    EvidenceQuality,
    EvidenceStance,
    FinalVerdict,
    InputType,
    SourceType,
    StyleRiskSignal,
)

MIN_LOCAL_STYLE_WORDS = 20
HIGH_STYLE_RISK_THRESHOLD = 0.80


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def normalize_text(text: object) -> str:
    import re

    normalized = str(text or "")
    normalized = normalized.replace("\n", " ").replace("\t", " ")
    normalized = re.sub(r"\s+", " ", normalized)
    return normalized.strip()


def truncate_for_display(text: str, limit: int = 220) -> str:
    text = normalize_text(text)
    if len(text) <= limit:
        return text
    return text[:limit].rstrip() + "..."


def count_words(text: str) -> int:
    return len(normalize_text(text).split())


def local_style_scope_warning(text: str) -> str | None:
    word_count = count_words(text)

    if word_count >= MIN_LOCAL_STYLE_WORDS:
        return None

    word_label = "word" if word_count == 1 else "words"
    return (
        f"Short input ({word_count} {word_label}). The local model is an article-style "
        "classifier, so this score is unreliable for factual verification."
    )


def input_type_label(input_type: InputType) -> str:
    labels = {
        InputType.DIRECT_TEXT: "Direct Text",
        InputType.URL: "URL",
        InputType.FILE: "File",
        InputType.UNKNOWN: "Unknown",
    }
    return labels.get(input_type, "Unknown")


@dataclass(frozen=True)
class AnalyzeContentCommand:
    text: str | None = None
    url: str | None = None
    file_path: Path | None = None
    deep_check: bool = False
    model_path: Path | None = None
    gemini_model: str | None = None
    max_search_results: int | None = None
    max_length: int | None = None


@dataclass(frozen=True)
class ExtractedDocument:
    input_type: InputType
    text: str
    source: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class StyleAnalysis:
    signal: StyleRiskSignal
    confidence: float | None = None
    model_name: str | None = None
    model_version: str | None = None
    max_length: int | None = None
    scope_reliable: bool = True
    word_count: int = 0
    minimum_word_count: int = MIN_LOCAL_STYLE_WORDS
    warning: str | None = None
    inference_duration_ms: float | None = None
    error: str | None = None

    @classmethod
    def from_prediction(
        cls,
        *,
        signal: StyleRiskSignal,
        confidence: float | None,
        text: str,
        model_name: str | None = None,
        model_version: str | None = None,
        max_length: int | None = None,
        inference_duration_ms: float | None = None,
        error: str | None = None,
    ) -> "StyleAnalysis":
        words = count_words(text)
        scope_reliable = words >= MIN_LOCAL_STYLE_WORDS
        return cls(
            signal=signal,
            confidence=confidence,
            model_name=model_name,
            model_version=model_version,
            max_length=max_length,
            scope_reliable=scope_reliable,
            word_count=words,
            minimum_word_count=MIN_LOCAL_STYLE_WORDS,
            warning=local_style_scope_warning(text) if not scope_reliable else None,
            inference_duration_ms=inference_duration_ms,
            error=error,
        )


@dataclass(frozen=True)
class SearchResult:
    title: str
    snippet: str
    url: str


@dataclass(frozen=True)
class SearchContext:
    query: str
    results: tuple[SearchResult, ...] = ()
    raw_context: str = ""
    error: str | None = None
    retrieved_at: datetime = field(default_factory=utc_now)


@dataclass(frozen=True)
class EvidenceItem:
    url: str
    title: str = ""
    publisher: str = ""
    canonical_url: str | None = None
    source_type: SourceType = SourceType.UNKNOWN
    stance: EvidenceStance = EvidenceStance.UNKNOWN
    reliability: EvidenceQuality = EvidenceQuality.LOW
    independence_key: str | None = None
    fetched: bool = False
    direct: bool = False
    is_original_claim: bool = False
    copied_from: str | None = None
    mentions_only: bool = False
    matches_claim: bool = True
    outdated: bool = False
    page_text: str = ""
    retrieved_at: datetime = field(default_factory=utc_now)

    @property
    def independence_group(self) -> str:
        return (
            self.copied_from
            or self.independence_key
            or self.canonical_url
            or self.publisher
            or self.url
        )


@dataclass(frozen=True)
class EvidenceAnalysis:
    provider_name: str
    verdict: FinalVerdict | None = None
    evidence_quality: EvidenceQuality = EvidenceQuality.LOW
    explanation: str = ""
    evidence_summary: tuple[str, ...] = ()
    recommendation: str = "Manual review recommended."
    items: tuple[EvidenceItem, ...] = ()
    raw_context: str | None = None
    error: str | None = None


@dataclass(frozen=True)
class VerdictDecision:
    verdict: FinalVerdict
    confidence: EvidenceQuality
    reason: str
    policy_version: str = "verdict-policy-v1"


@dataclass(frozen=True)
class AnalysisResult:
    document: ExtractedDocument
    style: StyleAnalysis
    evidence: EvidenceAnalysis | None
    search_context: SearchContext | None
    final: VerdictDecision
    timings_ms: dict[str, float] = field(default_factory=dict)
