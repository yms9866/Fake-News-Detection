"""Shared Pydantic DTOs for analysis requests and responses."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, HttpUrl


class AnalyzeTextRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    text: str = Field(min_length=1, max_length=200_000)
    deep_check: bool = False


class AnalyzeUrlRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    url: HttpUrl
    deep_check: bool = False


class EvidenceSummaryItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    url: str
    title: str = ""
    stance: str = "UNKNOWN"
    source_type: str = "UNKNOWN"
    reliability: Literal["HIGH", "MEDIUM", "LOW"] = "LOW"
    fetched: bool = False


class AnalysisResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    input_type: str
    extracted_text: str
    style_signal: str
    style_confidence: float | None
    verification_verdict: str | None
    evidence_quality: Literal["HIGH", "MEDIUM", "LOW"] | None
    final_verdict: str
    final_confidence: Literal["HIGH", "MEDIUM", "LOW"]
    reason: str
    evidence: list[EvidenceSummaryItem] = Field(default_factory=list)
