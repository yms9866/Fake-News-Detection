"""Domain enums used by workflows, adapters, and policy."""

from __future__ import annotations

from enum import Enum


class InputType(str, Enum):
    DIRECT_TEXT = "text"
    URL = "url"
    FILE = "file"
    UNKNOWN = "unknown"


class MediaType(str, Enum):
    IMAGE = "image"
    AUDIO = "audio"
    VIDEO = "video"


class JobStatus(str, Enum):
    QUEUED = "queued"
    VALIDATING = "validating"
    PREPROCESSING = "preprocessing"
    EXTRACTING = "extracting"
    CLEANING = "cleaning"
    STYLE_ANALYSIS = "style_analysis"
    SEARCHING = "searching"
    FETCHING_EVIDENCE = "fetching_evidence"
    VERIFYING = "verifying"
    DECIDING = "deciding"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"

    @property
    def is_terminal(self) -> bool:
        return self in {
            JobStatus.COMPLETED,
            JobStatus.FAILED,
            JobStatus.CANCELLED,
        }


class StyleRiskSignal(str, Enum):
    LOW = "LOW_STYLE_RISK"
    HIGH = "HIGH_STYLE_RISK"
    UNKNOWN = "UNKNOWN"
    ERROR = "ERROR"


class EvidenceQuality(str, Enum):
    HIGH = "HIGH"
    MEDIUM = "MEDIUM"
    LOW = "LOW"
    UNKNOWN = "UNKNOWN"


class EvidenceStance(str, Enum):
    SUPPORTS = "SUPPORTS"
    CONTRADICTS = "CONTRADICTS"
    MENTIONS = "MENTIONS"
    IRRELEVANT = "IRRELEVANT"
    UNKNOWN = "UNKNOWN"


class SourceType(str, Enum):
    OFFICIAL = "OFFICIAL"
    OFFICIAL_DOCUMENT = "OFFICIAL_DOCUMENT"
    GOVERNMENT = "GOVERNMENT"
    INTERNATIONAL_ORGANIZATION = "INTERNATIONAL_ORGANIZATION"
    PRIMARY_SOURCE = "PRIMARY_SOURCE"
    WIRE_SERVICE = "WIRE_SERVICE"
    ESTABLISHED_NEWS = "ESTABLISHED_NEWS"
    REPUTABLE_NEWS = "REPUTABLE_NEWS"
    FACT_CHECK = "FACT_CHECK"
    FACT_CHECKER = "FACT_CHECKER"
    ACADEMIC = "ACADEMIC"
    SOCIAL_MEDIA = "SOCIAL_MEDIA"
    SOCIAL_PLATFORM = "SOCIAL_PLATFORM"
    USER_GENERATED = "USER_GENERATED"
    BLOG = "BLOG"
    VIDEO_PLATFORM = "VIDEO_PLATFORM"
    WIKI = "WIKI"
    UNKNOWN = "UNKNOWN"


class FinalVerdict(str, Enum):
    REAL = "REAL"
    FAKE = "FAKE"
    UNVERIFIED = "UNVERIFIED"
    SUSPICIOUS_UNVERIFIED = "SUSPICIOUS / UNVERIFIED"
    ERROR = "ERROR"
    SUPPORTED = "SUPPORTED"
    LIKELY_SUPPORTED = "LIKELY_SUPPORTED"
    PARTIALLY_SUPPORTED = "PARTIALLY_SUPPORTED"
    CONTRADICTED = "CONTRADICTED"
    LIKELY_CONTRADICTED = "LIKELY_CONTRADICTED"
    MIXED = "MIXED"
    INSUFFICIENT_EVIDENCE = "INSUFFICIENT_EVIDENCE"
    NOT_VERIFIABLE = "NOT_VERIFIABLE"


class ClaimStatus(str, Enum):
    SUPPORTED = "SUPPORTED"
    LIKELY_SUPPORTED = "LIKELY_SUPPORTED"
    CONTRADICTED = "CONTRADICTED"
    LIKELY_CONTRADICTED = "LIKELY_CONTRADICTED"
    MIXED = "MIXED"
    INSUFFICIENT_EVIDENCE = "INSUFFICIENT_EVIDENCE"
    NOT_VERIFIABLE = "NOT_VERIFIABLE"


class ClaimImportance(str, Enum):
    HIGH = "HIGH"
    MEDIUM = "MEDIUM"
    LOW = "LOW"


class ClaimType(str, Enum):
    EVENT = "EVENT"
    QUANTITY = "QUANTITY"
    ATTRIBUTION = "ATTRIBUTION"
    LOCATION = "LOCATION"
    DATE = "DATE"
    OTHER = "OTHER"
