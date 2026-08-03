"""Core domain entities for analysis and evidence policy."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .enums import (
    ClaimImportance,
    ClaimStatus,
    ClaimType,
    EvidenceQuality,
    EvidenceStance,
    FinalVerdict,
    InputType,
    SourceType,
    StyleRiskSignal,
)

MIN_LOCAL_STYLE_WORDS = 20
HIGH_STYLE_RISK_THRESHOLD = 0.80
STYLE_ASSESSMENT_LIMITATION = (
    "This assessment evaluates writing patterns only. Writing style alone cannot "
    "establish whether the claims are true or false."
)


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


def style_display_text(signal: StyleRiskSignal) -> str:
    if signal == StyleRiskSignal.LOW:
        return "The writing style seems similar to real or legitimate news reporting."
    if signal == StyleRiskSignal.HIGH:
        return (
            "The writing style seems similar to fake, misleading, or fabricated "
            "content."
        )
    if signal == StyleRiskSignal.ERROR:
        return "The writing-style assessment could not be completed."
    return "The writing-style assessment is unavailable."


def style_display_label(signal: StyleRiskSignal) -> str:
    if signal == StyleRiskSignal.LOW:
        return "RESEMBLES_LEGITIMATE_REPORTING"
    if signal == StyleRiskSignal.HIGH:
        return "RESEMBLES_MISLEADING_OR_FABRICATED_CONTENT"
    if signal == StyleRiskSignal.ERROR:
        return "STYLE_ASSESSMENT_FAILED"
    return "STYLE_ASSESSMENT_UNAVAILABLE"


def confidence_level(score: float | None) -> str:
    if score is None:
        return "UNKNOWN"
    numeric = float(score)
    if numeric >= 0.95:
        return "VERY_HIGH"
    if numeric >= 0.80:
        return "HIGH"
    if numeric >= 0.65:
        return "MEDIUM"
    return "LOW"


def display_confidence(score: float | None) -> str:
    if score is None:
        return "N/A"
    numeric = float(score)
    bounded = max(0.0, min(numeric, 0.999))
    if numeric >= 0.9995:
        return ">99.9%"
    return f"{bounded * 100:.1f}%"


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

    @property
    def display_label(self) -> str:
        return style_display_label(self.signal)

    @property
    def display_text(self) -> str:
        return style_display_text(self.signal)

    @property
    def confidence_level(self) -> str:
        return confidence_level(self.confidence)

    @property
    def display_confidence(self) -> str:
        return display_confidence(self.confidence)

    @property
    def limitation(self) -> str:
        return STYLE_ASSESSMENT_LIMITATION

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
class SearchQueryRecord:
    query_id: str
    claim_id: str
    query: str
    query_type: str
    provider: str = "public_web"
    result_count: int = 0
    duration_ms: float | None = None
    error: str | None = None
    searched_at: datetime = field(default_factory=utc_now)


@dataclass(frozen=True)
class SearchContext:
    query: str
    results: tuple[SearchResult, ...] = ()
    raw_context: str = ""
    error: str | None = None
    retrieved_at: datetime = field(default_factory=utc_now)
    queries: tuple[SearchQueryRecord, ...] = ()
    reviewed_sources: tuple["EvidenceItem", ...] = ()


@dataclass(frozen=True)
class RelevantPassage:
    text: str
    relevance_score: float = 0.0


@dataclass(frozen=True)
class ClaimAssessment:
    claim_id: str
    verdict: ClaimStatus = ClaimStatus.INSUFFICIENT_EVIDENCE
    confidence: EvidenceQuality = EvidenceQuality.LOW
    explanation: str = ""
    supporting_source_ids: tuple[str, ...] = ()
    contradicting_source_ids: tuple[str, ...] = ()
    unresolved_reason: str | None = None


@dataclass(frozen=True)
class AtomicClaim:
    claim_id: str
    sequence: int
    claim_text: str
    normalized_claim: str
    importance: ClaimImportance = ClaimImportance.MEDIUM
    claim_type: ClaimType = ClaimType.OTHER
    entities: tuple[str, ...] = ()
    people: tuple[str, ...] = ()
    organizations: tuple[str, ...] = ()
    locations: tuple[str, ...] = ()
    detected_dates: tuple[str, ...] = ()
    publication_period: str | None = None
    verifiability: str = "VERIFIABLE"
    search_queries: tuple[str, ...] = ()
    verification_status: ClaimStatus = ClaimStatus.INSUFFICIENT_EVIDENCE
    confidence: EvidenceQuality = EvidenceQuality.LOW
    explanation: str = ""
    supporting_source_ids: tuple[str, ...] = ()
    contradicting_source_ids: tuple[str, ...] = ()
    unresolved_reason: str | None = None

    def with_assessment(self, assessment: ClaimAssessment) -> "AtomicClaim":
        return AtomicClaim(
            claim_id=self.claim_id,
            sequence=self.sequence,
            claim_text=self.claim_text,
            normalized_claim=self.normalized_claim,
            importance=self.importance,
            claim_type=self.claim_type,
            entities=self.entities,
            people=self.people,
            organizations=self.organizations,
            locations=self.locations,
            detected_dates=self.detected_dates,
            publication_period=self.publication_period,
            verifiability=self.verifiability,
            search_queries=self.search_queries,
            verification_status=assessment.verdict,
            confidence=assessment.confidence,
            explanation=assessment.explanation,
            supporting_source_ids=assessment.supporting_source_ids,
            contradicting_source_ids=assessment.contradicting_source_ids,
            unresolved_reason=assessment.unresolved_reason,
        )


@dataclass(frozen=True)
class EvidenceItem:
    url: str
    title: str = ""
    publisher: str = ""
    source_id: str = ""
    related_claim_ids: tuple[str, ...] = ()
    canonical_url: str | None = None
    source_type: SourceType = SourceType.UNKNOWN
    stance: EvidenceStance = EvidenceStance.UNKNOWN
    reliability: EvidenceQuality = EvidenceQuality.UNKNOWN
    reliability_reason: str = ""
    independence_key: str | None = None
    fetched: bool = False
    fetch_attempted: bool = False
    fetch_status: int | None = None
    fetch_error_code: str | None = None
    content_type: str = ""
    direct: bool = False
    is_original_claim: bool = False
    copied_from: str | None = None
    mentions_only: bool = False
    matches_claim: bool = True
    outdated: bool = False
    search_provider: str = ""
    search_query: str = ""
    search_rank: int | None = None
    search_snippet: str = ""
    page_text: str = ""
    text_hash: str = ""
    extracted_char_count: int = 0
    relevant_passages: tuple[RelevantPassage, ...] = ()
    relevance_score: float = 0.0
    qualification_status: str = "NOT_QUALIFIED"
    rejection_reasons: tuple[str, ...] = ()
    used_in_explanation: bool = False
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
    confidence: EvidenceQuality = EvidenceQuality.LOW
    explanation: str = ""
    evidence_summary: tuple[str, ...] = ()
    recommendation: str = "Manual review recommended."
    items: tuple[EvidenceItem, ...] = ()
    claim_assessments: tuple[ClaimAssessment, ...] = ()
    grounding_used: bool = False
    limitations: tuple[str, ...] = ()
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
    claims: tuple[AtomicClaim, ...] = ()
    timings_ms: dict[str, float] = field(default_factory=dict)
