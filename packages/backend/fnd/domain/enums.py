"""Domain enums used by workflows, adapters, and policy."""

from __future__ import annotations

from enum import Enum


class InputType(str, Enum):
    DIRECT_TEXT = "Direct Text"
    URL = "URL"
    FILE = "File"
    UNKNOWN = "Unknown"


class StyleRiskSignal(str, Enum):
    LOW = "LOW STYLE RISK"
    HIGH = "HIGH STYLE RISK"
    UNKNOWN = "UNKNOWN"
    ERROR = "ERROR"


class EvidenceQuality(str, Enum):
    HIGH = "HIGH"
    MEDIUM = "MEDIUM"
    LOW = "LOW"


class EvidenceStance(str, Enum):
    SUPPORTS = "SUPPORTS"
    CONTRADICTS = "CONTRADICTS"
    MENTIONS = "MENTIONS"
    IRRELEVANT = "IRRELEVANT"
    UNKNOWN = "UNKNOWN"


class SourceType(str, Enum):
    OFFICIAL = "OFFICIAL"
    REPUTABLE_NEWS = "REPUTABLE_NEWS"
    FACT_CHECK = "FACT_CHECK"
    SOCIAL_MEDIA = "SOCIAL_MEDIA"
    BLOG = "BLOG"
    UNKNOWN = "UNKNOWN"


class FinalVerdict(str, Enum):
    REAL = "REAL"
    FAKE = "FAKE"
    UNVERIFIED = "UNVERIFIED"
    SUSPICIOUS_UNVERIFIED = "SUSPICIOUS / UNVERIFIED"
    ERROR = "ERROR"
