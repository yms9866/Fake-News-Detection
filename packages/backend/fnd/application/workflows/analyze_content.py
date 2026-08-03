"""Analyze-content workflow shared by CLI and future API clients."""

from __future__ import annotations

from dataclasses import dataclass
import json
import logging
from time import perf_counter

from packages.backend.fnd.application.services.evidence_pipeline import (
    EvidenceReviewPipeline,
)
from packages.backend.fnd.application.services.verdict_policy import VerdictPolicy
from packages.backend.fnd.domain.entities import (
    AnalysisResult,
    AnalyzeContentCommand,
    EvidenceAnalysis,
    ExtractedDocument,
    SearchContext,
    StyleAnalysis,
    normalize_text,
)
from packages.backend.fnd.domain.enums import (
    EvidenceQuality,
    FinalVerdict,
    StyleRiskSignal,
)
from packages.backend.fnd.domain.errors import UnsupportedInputError
from packages.backend.fnd.ports.extraction import (
    FileExtractor,
    TextExtractor,
    UrlExtractor,
)
from packages.backend.fnd.ports.llm import LanguageModelEvidenceProvider
from packages.backend.fnd.ports.search import SearchProvider
from packages.backend.fnd.ports.style_model import StyleModelProvider

logger = logging.getLogger(__name__)


def _log_timing(event: str, **fields: float | str) -> None:
    payload: dict[str, float | str] = {"event": event, **fields}
    logger.info(json.dumps(payload, ensure_ascii=True))


@dataclass
class AnalyzeContentWorkflow:
    text_extractor: TextExtractor
    url_extractor: UrlExtractor
    file_extractor: FileExtractor
    style_model: StyleModelProvider
    search_provider: SearchProvider
    evidence_provider: LanguageModelEvidenceProvider
    verdict_policy: VerdictPolicy
    evidence_review_pipeline: EvidenceReviewPipeline | None = None

    def analyze(self, command: AnalyzeContentCommand) -> AnalysisResult:
        document = self._extract(command)
        return self.analyze_document(
            document=document,
            deep_check=command.deep_check,
            max_length=command.max_length,
            max_search_results=command.max_search_results,
        )

    def analyze_document(
        self,
        *,
        document: ExtractedDocument,
        deep_check: bool = False,
        max_length: int | None = None,
        max_search_results: int | None = None,
    ) -> AnalysisResult:
        analysis_start = perf_counter()
        resolved_max_length = max_length or 1024
        timings_ms: dict[str, float] = {}

        style_start = perf_counter()
        try:
            style = self.style_model.analyze(
                document.text,
                max_length=resolved_max_length,
            )
        except Exception as exc:
            style = StyleAnalysis.from_prediction(
                signal=StyleRiskSignal.ERROR,
                confidence=None,
                text=document.text,
                error=str(exc),
            )
        timings_ms["style_analysis"] = (perf_counter() - style_start) * 1000

        search_context: SearchContext | None = None
        evidence: EvidenceAnalysis | None = None

        if deep_check and normalize_text(document.text):
            max_results = max_search_results or 6
            search_start = perf_counter()
            if self.evidence_review_pipeline is not None:
                reviewed = self.evidence_review_pipeline.review(
                    text=document.text,
                    max_results=max_results,
                )
                claims = reviewed.claims
                search_context = reviewed.search_context
            else:
                search_context = self.search_provider.search(
                    claim_text=document.text,
                    max_results=max_results,
                )
                claims = ()
            timings_ms["search_and_source_review"] = (
                perf_counter() - search_start
            ) * 1000

            evidence_start = perf_counter()
            evidence = self.evidence_provider.verify(
                claim_text=document.text,
                search_context=search_context,
            )
            timings_ms["evidence_analysis"] = (perf_counter() - evidence_start) * 1000
        else:
            claims = ()

        final = self.verdict_policy.decide(style=style, evidence=evidence)
        timings_ms["analysis_total"] = (perf_counter() - analysis_start) * 1000
        _log_timing(
            "analysis_timing",
            analysis_duration_ms=round(timings_ms["analysis_total"], 3),
            style_analysis_duration_ms=round(timings_ms["style_analysis"], 3),
            input_type=document.input_type.value,
            word_count=str(style.word_count),
        )
        return AnalysisResult(
            document=document,
            style=style,
            evidence=evidence,
            search_context=search_context,
            final=final,
            claims=claims,
            timings_ms=timings_ms,
        )

    def _extract(self, command: AnalyzeContentCommand) -> ExtractedDocument:
        if command.text:
            return self.text_extractor.extract(command.text)

        if command.url:
            return self.url_extractor.extract(command.url)

        if command.file_path:
            return self.file_extractor.extract(command.file_path)

        raise UnsupportedInputError("You must provide text, URL, or file input.")

    def _evidence_provider_has_missing_key(self) -> bool:
        return getattr(self.evidence_provider, "api_key", None) in {None, ""}


class DisabledEvidenceProvider:
    def verify(
        self, claim_text: str, search_context: SearchContext
    ) -> EvidenceAnalysis:
        return EvidenceAnalysis(
            provider_name="disabled",
            verdict=FinalVerdict.ERROR,
            evidence_quality=EvidenceQuality.LOW,
            confidence=EvidenceQuality.LOW,
            explanation="External AI verification is disabled.",
            recommendation="Enable external AI and configure a provider key to run deep checks.",
            items=search_context.reviewed_sources,
            grounding_used=bool(search_context.reviewed_sources),
            raw_context=search_context.raw_context,
            error="EXTERNAL_AI_DISABLED",
        )
